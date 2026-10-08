// 离线音频包生成:用 macOS 系统 TTS(say)+ afconvert 把全部内容的发音
// 预生成成 m4a,解决浏览器 TTS 音质不稳定/语音模糊的问题。
//   public/audio/vocab/{wordId}.m4a        单词发音
//   public/audio/vocab/{wordId}-ex.m4a     词例句发音
//   public/audio/reading/{articleId}/s{n}.m4a  文章整句(编号与 pron 调度一致)
// 增量生成:已存在的文件跳过(--force 全部重做);产物清单写入
// public/data/audio-manifest.json(语音/时间/覆盖范围,供核对与排障)。
// 句子切分逻辑必须与 app/lib/scheduler/pron.ts 的 splitSentences/
// collectReadingSentences 保持一致(lookbehind 按 .!? 切,词数 4–14,编号=段号×100+句序)。

import { mkdir, readdir, readFile, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = new URL("../", import.meta.url).pathname;
const force = process.argv.includes("--force");
const CONCURRENCY = 4;
const PRON_SENTENCE_MIN_WORDS = 4;
const PRON_SENTENCE_MAX_WORDS = 14;

// 优先神经语音(清晰自然),经典增强语音兜底
const VOICE_CANDIDATES = [
  "Reed (英语（美国）)",
  "Sandy (英语（美国）)",
  "Samantha",
];

// say 依赖 speechsynthesisd,守护进程偶发僵死会让 say 永不返回,因此统一加超时看门狗
function run(cmd, args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      p.kill("SIGKILL");
      // 守护进程僵死时新 say 会跟着挂起,顺手踢掉让 launchd 按需拉起新实例
      spawn("killall", ["speechsynthesisd"], { stdio: "ignore" });
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function pickVoice() {
  const probe = join(tmpdir(), `readtime-voice-probe-${randomUUID()}.aiff`);
  for (const voice of VOICE_CANDIDATES) {
    try {
      await run("say", ["-v", voice, "-o", probe, "hello"]);
      return voice;
    } catch {
      // 试下一个
    }
  }
  throw new Error("没有可用的英文系统语音(say)");
}

const splitSentences = (para) =>
  para
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** 载入分片内容模块:index.json 记 total/parts,正文在 part-XX.json(单文件 ≤ 500KB 字节分片) */
async function loadChunked(relDir, label) {
  const readJson = async (rel) => JSON.parse(await readFile(join(ROOT, rel), "utf8"));
  try {
    const index = await readJson(`${relDir}/index.json`);
    const parts = [];
    for (let p = 1; p <= index.parts; p++) {
      parts.push(...(await readJson(`${relDir}/part-${String(p).padStart(2, "0")}.json`)));
    }
    if (parts.length !== index.total) {
      throw new Error(`${label} 分片条目数(${parts.length})与 index.total(${index.total})不一致`);
    }
    return parts;
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(`· ${label} 内容暂缺,跳过对应音频`);
      return [];
    }
    throw e;
  }
}

/** 生成一个片段:aiff(say)→ m4a(afconvert,单声道 48kbps AAC)。 */
async function synthesize(text, outFile, voice) {
  const aiff = join(tmpdir(), `readtime-audio-${randomUUID()}.aiff`);
  try {
    await run("say", ["-v", voice, "-o", aiff, text]);
    await run("afconvert", ["-f", "m4af", "-d", "aac", "-b", "48000", "-c", "1", aiff, outFile]);
  } finally {
    await run("rm", ["-f", aiff]).catch(() => {});
  }
}

async function main() {
  const voice = await pickVoice();
  console.log(`语音: ${voice}${force ? "(--force 全量重做)" : "(增量)"}`);

  // 三个 stage 词库全部纳入音频供给(增量生成,已有文件自动跳过)
  const vocabStages = await Promise.all(
    ["stage1", "stage2", "stage3"].map(async (s) =>
      JSON.parse(await readFile(join(ROOT, `public/data/vocab/${s}.json`), "utf8"))
    )
  );
  const articleList = (
    await Promise.all([loadChunked("public/data/reading/l2", "阅读 l2"), loadChunked("public/data/reading/l3", "阅读 l3")])
  ).flat();
  const wordList = vocabStages.flatMap((vocab) => vocab.words ?? vocab);
  // 听力素材库(不存在时跳过,内容可先行落地再补音频)
  const listeningList = await loadChunked("public/data/listening", "听力");

  // 任务队列:[文本, 输出路径]
  const jobs = [];
  for (const w of wordList) {
    jobs.push({ text: w.term, out: join(ROOT, `public/audio/vocab/${w.id}.m4a`) });
    const en = w.examples?.[0]?.en;
    if (en) jobs.push({ text: en, out: join(ROOT, `public/audio/vocab/${w.id}-ex.m4a`) });
  }
  for (const a of articleList) {
    a.paragraphs.forEach((para, pi) => {
      splitSentences(para)
        .filter((en) => {
          const wc = en.split(/\s+/).length;
          return wc >= PRON_SENTENCE_MIN_WORDS && wc <= PRON_SENTENCE_MAX_WORDS;
        })
        .forEach((en, si) => {
          jobs.push({
            text: en,
            out: join(ROOT, `public/audio/reading/${a.id}/s${pi * 100 + si}.m4a`),
          });
        });
    });
  }
  // 听力素材:逐句整段生成(句序 1 起,与 listeningSentenceAudioUrl 约定一致)
  for (const item of listeningList) {
    item.sentences.forEach((s, i) => {
      jobs.push({
        text: s.en,
        out: join(ROOT, `public/audio/listening/${item.id}/s${i + 1}.m4a`),
      });
    });
  }

  await Promise.all(
    [...new Set(jobs.map((j) => j.out))].map((out) => mkdir(join(out, ".."), { recursive: true }))
  );

  const pending = [];
  for (const job of jobs) {
    if (force || !(await exists(job.out))) pending.push(job);
  }
  console.log(`共 ${jobs.length} 段音频,待生成 ${pending.length} 段`);

  let done = 0;
  let failed = 0;
  const failedTexts = [];
  const startedAt = Date.now();
  const worker = async (queue) => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      try {
        await synthesize(job.text, job.out, voice);
      } catch {
        failed += 1;
        failedTexts.push(job.text.slice(0, 40));
      }
      done += 1;
      if (done % 200 === 0) {
        const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
        console.log(`  进度 ${done}/${pending.length}(${secs}s,失败 ${failed})`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(pending)));

  // 产物清单(生成记录,供核对与增量重产;音频不进 npm test 卡口,缺失时运行时回退 TTS)
  const manifest = {
    voice,
    generatedAt: new Date().toISOString(),
    words: wordList.map((w) => w.id),
    examples: wordList.filter((w) => w.examples?.[0]?.en).map((w) => w.id),
    sentences: [],
    listeningSentences: [],
  };
  for (const a of articleList) {
    const dir = join(ROOT, `public/audio/reading/${a.id}`);
    if (await exists(dir)) {
      manifest.sentences.push(
        ...(await readdir(dir)).filter((f) => f.endsWith(".m4a")).map((f) => `${a.id}/${f.slice(0, -4)}`)
      );
    }
  }
  for (const item of listeningList) {
    const dir = join(ROOT, `public/audio/listening/${item.id}`);
    if (await exists(dir)) {
      manifest.listeningSentences.push(
        ...(await readdir(dir)).filter((f) => f.endsWith(".m4a")).map((f) => `${item.id}/${f.slice(0, -4)}`)
      );
    }
  }
  await writeFile(
    join(ROOT, "public/data/audio-manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `完成:词 ${manifest.words.length}、例句 ${manifest.examples.length}、文章句 ${manifest.sentences.length}、听力句 ${manifest.listeningSentences.length};失败 ${failed}`
  );
  if (failedTexts.length > 0) {
    console.log("失败片段(前 10):", failedTexts.slice(0, 10));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
