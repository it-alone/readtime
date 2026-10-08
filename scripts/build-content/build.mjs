#!/usr/bin/env node
// 内容管线(ARCHITECTURE.md §7.4 内容即数据):
//   scripts/build-content/vocab/stage{1,2,3}/*.tsv →  public/data/vocab/stageN/(manifest + part-XX).json
//   scripts/build-content/grammar/stage{1,2,3}/*.tsv →  public/data/grammar/(index + part-XX).json
//   scripts/build-content/reading/l2/*.tsv       →  public/data/reading/l2/(index + part-XX).json
//   scripts/build-content/reading/l3/*.tsv       →  public/data/reading/l3/(index + part-XX).json
//   scripts/build-content/listening/l{1,2}/*.tsv →  public/data/listening/(index + part-XX).json
//
// 分片统一卡 ARCHITECTURE.md §11 性能预算(public/data 单文件 ≤ 500KB,构建目标 ≤ 450KB):
//   part-XX.json = 完整条目,字节优先 + 条数封顶(语法/阅读/听力 200 条、词库 2000 条,先到为准);
//   index.json   = { total, parts, indexParts, items } 轻量 meta,列表页只拉这个;
//                  meta 本身过大时再拆 index-part-XX.json(index.json 的 items 留空,清单头保留);
//   词库单 stage 0.7–1.1MB,同样按 450KB 拆成 manifest.json({total,parts})+ part-XX.json 顺序加载。
// tests/content.test.ts 对 public/data 逐文件卡 ≤ 500KB 预算,超限即测试失败。
//
// 用法:
//   npm run build:content                          # 全部 TSV → JSON(生成 + 校验)
//   node scripts/build-content/build.mjs --import some.json
//                                                  # JSON → TSV(一次性迁移旧数据,自动识别类型)
//
// 编辑内容只改 TSV,不要手改生成的 JSON。
//
// ── 词库 TSV(每单元一个文件,如 u01.tsv;文件名即 unit;stage 目录即年级)──
//   列(制表符分隔):term  phonetic  meaning  level  example_en  example_zh  tags(| 分隔)
//   id 编号(w-s1-/w-s2- 前缀)、unit、stage 由脚本推导,保证 content.test.ts 的顺序契约。
//   各 stage 的 term 不得重复(跨年词库为累积制,tests/content.test.ts 卡口)。
//
// ── 语法课程 TSV(每课一个文件,如 g-101.tsv;文件名即课程 id;stage 目录即年级)──
//   `#` 开头是课程元信息(只写一次):
//     # title	标题
//     # summary	摘要
//     # level	A1
//     # points	知识点1|知识点2|…
//     # example	英文例句	中文翻译     (可重复多行)
//   其余每行一题(3 列):题干  选项1|选项2|…  答案序号(1 起)  解析
//   题目 id(g-101-q1)与 stage 由脚本推导;每课固定 6 题。
//
// ── 阅读短文 TSV(每篇一个文件,如 r2-01.tsv / r3-01.tsv;文件名即文章 id,目录即 stage)──
//   `#` 开头是文章元信息:
//     # title	标题
//     # topic	场景主题
//     # summary	一句话简介
//     # level	A2
//     # para	正文段落            (可重复多行,一段一行)
//     # glossary	词汇	中文释义   (可重复多行)
//   其余每行一题(同语法):题干  选项1|选项2|…  答案序号(1 起)  解析
//   题目 id(r2-01-q1)、stage、wordCount(按空格统计)由脚本推导;每篇 3–8 题。
//
// ── 听力素材 TSV(每篇一个文件,如 ls1-01.tsv;文件名即素材 id,目录即 stage)──
//   `#` 开头是素材元信息:
//     # title	标题
//     # topic	场景主题
//     # summary	一句话简介
//     # level	A1
//     # type	dialogue 或 monologue
//     # s	英文句子	中文翻译      (可重复多行,顺序即播放顺序,3–10 句)
//   其余每行一题(同语法):题干  选项1|选项2|…  答案序号(1 起)  解析
//   题目 id(ls1-01-q1)、stage 由脚本推导;每篇 3–5 题;
//   音频路径约定 public/audio/listening/{id}/s{句序,1 起}.m4a。
//
// 注:zod schema 在此镜像自 app/lib/api/schemas.ts(脚本是纯 Node,不编译 TS),
//     真正的契约卡口是 tests/content.test.ts 对生成 JSON 的校验。

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { z } from "zod";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, "..", "..");
// 词库按年级分目录;id 前缀与 stage 由目录推导(产物是 vocab/stageN/ 分片目录)
const VOCAB_SPECS = [
  { stage: 1, dir: join(SCRIPT_DIR, "vocab", "stage1"), prefix: "w-s1-" },
  { stage: 2, dir: join(SCRIPT_DIR, "vocab", "stage2"), prefix: "w-s2-" },
  { stage: 3, dir: join(SCRIPT_DIR, "vocab", "stage3"), prefix: "w-s3-" },
];
// 语法按年级分目录,合并分片输出到 public/data/grammar/(index + part-XX)
const GRAMMAR_SPECS = [
  { stage: 1, dir: join(SCRIPT_DIR, "grammar", "stage1") },
  { stage: 2, dir: join(SCRIPT_DIR, "grammar", "stage2") },
  { stage: 3, dir: join(SCRIPT_DIR, "grammar", "stage3") },
];
// 阅读按年级分目录:l2 = 第 2 年场景短文,l3 = 第 3 年 B2 深度文章;各输出到 data/reading/lX/
const READING_SPECS = [
  { stage: 2, dir: join(SCRIPT_DIR, "reading", "l2"), json: join(PROJECT_ROOT, "public", "data", "reading", "l2", "index.json") },
  { stage: 3, dir: join(SCRIPT_DIR, "reading", "l3"), json: join(PROJECT_ROOT, "public", "data", "reading", "l3", "index.json") },
];
// 听力按年级分目录:l1 = 第 1 年 A1/A2 精听,l2 = 第 2 年 B1 精听;合并分片输出到 data/listening/
const LISTENING_SPECS = [
  { stage: 1, dir: join(SCRIPT_DIR, "listening", "l1") },
  { stage: 2, dir: join(SCRIPT_DIR, "listening", "l2") },
];

const QUESTIONS_PER_LESSON = 6;
const LEVELS = new Set(["A1", "A2", "B1", "B2"]);
const VOCAB_COLUMNS = ["term", "phonetic", "meaning", "level", "example_en", "example_zh", "tags"];

// ── 海量内容分片(ARCHITECTURE.md §11:public/data 单文件 ≤ 500KB,构建目标 450KB 留余量)──
const MAX_PART_BYTES = 450 * 1024;
const CONTENT_CHUNK_MAX_ITEMS = 200; // 语法/阅读/听力:条数封顶(限制单片解析内存)
const VOCAB_CHUNK_MAX_ITEMS = 2000; // 词库:单词 ~250B,实际几乎总由字节约束先触发
const INDEX_CHUNK_MAX_ITEMS = 500; // 索引 meta:条数封顶,防极端小 meta 堆出超宽片

function seqOf(id, prefix, file) {
  const digits = id.slice(prefix.length);
  if (!/^\d+$/.test(digits)) fail(`文件名 ${file} 的编号段不合法:${id}`);
  return parseInt(digits, 10);
}

/** 按文件名中的数字段升序排序(字典序在 999→1000 边界会乱序) */
function sortBySeq(files, prefix) {
  return [...files].sort((a, b) =>
    seqOf(a.replace(/\.tsv$/, ""), prefix, a) - seqOf(b.replace(/\.tsv$/, ""), prefix, b));
}

/**
 * 字节优先、条数封顶的稳定切分:累计到 450KB 或 maxItems 即开新片(先到为准);
 * 单条自身超限时独立成片(现有条目都远小于上限,不会触发)。顺序保持与输入一致。
 */
function chunkBy(items, maxItems) {
  const chunks = [];
  let cur = [];
  let curBytes = 0;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item), "utf8") + 2; // 逗号 + 换行开销
    if (cur.length > 0 && (curBytes + size > MAX_PART_BYTES || cur.length >= maxItems)) {
      chunks.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(item);
    curBytes += size;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/** 清空旧的分片产物(条目缩减时残留的旧 part 会污染加载顺序) */
async function resetDir(dir) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/**
 * 写分片产物:index.json(轻量 meta)+ part-XX.json(全量数据)。
 * metaOf 抽取列表页所需字段;part 字段标记条目所在分片(1 起)。
 * meta 本身超过单文件预算时再拆 index-part-XX.json(index.json 的 items 留空)。
 */
async function writeChunked(jsonDir, items, metaOf, label, chunkMaxItems = CONTENT_CHUNK_MAX_ITEMS) {
  await resetDir(jsonDir);
  const entries = items.map((item) => ({ item, meta: metaOf(item) }));
  const dataChunks = chunkBy(entries, chunkMaxItems);
  const metas = [];
  for (let p = 0; p < dataChunks.length; p++) {
    const chunk = dataChunks[p];
    await writeFile(
      join(jsonDir, `part-${String(p + 1).padStart(2, "0")}.json`),
      serializeJson(chunk.map((e) => e.item)),
      "utf-8",
    );
    for (const e of chunk) metas.push({ ...e.meta, part: p + 1 });
  }
  const indexChunks = chunkBy(metas, INDEX_CHUNK_MAX_ITEMS);
  const indexParts = indexChunks.length;
  const itemsField =
    indexParts === 1
      ? `[\n${indexChunks[0].map((m) => `    ${JSON.stringify(m)}`).join(",\n")}\n  ]`
      : "[]";
  await writeFile(
    join(jsonDir, "index.json"),
    `{\n  "total": ${items.length},\n  "parts": ${dataChunks.length},\n  "indexParts": ${indexParts},\n  "items": ${itemsField}\n}\n`,
    "utf-8",
  );
  for (let ip = 0; ip < indexParts; ip++) {
    await writeFile(
      join(jsonDir, `index-part-${String(ip + 1).padStart(2, "0")}.json`),
      serializeJson(indexChunks[ip]),
      "utf-8",
    );
  }
  console.log(
    `✓ ${label} ${items.length} 条 → ${relative(PROJECT_ROOT, jsonDir)}` +
      `(${dataChunks.length} 片 + 索引${indexParts > 1 ? `拆 ${indexParts} 片` : "内联"})`,
  );
}

/**
 * 词库分片:manifest.json({total, parts})+ part-XX.json。
 * 词库没有列表页 meta(整 stage 顺序全量加载),只需要一个清单头。
 */
async function writeVocabSharded(stage, words) {
  const dir = join(PROJECT_ROOT, "public", "data", "vocab", `stage${stage}`);
  await resetDir(dir);
  const chunks = chunkBy(words, VOCAB_CHUNK_MAX_ITEMS);
  await writeFile(join(dir, "manifest.json"), `{\n  "total": ${words.length},\n  "parts": ${chunks.length}\n}\n`, "utf-8");
  for (let p = 0; p < chunks.length; p++) {
    await writeFile(join(dir, `part-${String(p + 1).padStart(2, "0")}.json`), serializeJson(chunks[p]), "utf-8");
  }
  console.log(`✓ 词库 stage${stage} ${words.length} 词 → ${relative(PROJECT_ROOT, dir)}(manifest + ${chunks.length} 片)`);
}

// 镜像自 app/lib/api/schemas.ts
const WordSchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  phonetic: z.string(),
  meaning: z.string().min(1),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  unit: z.string(),
  examples: z.array(z.object({ en: z.string(), zh: z.string() })),
  tags: z.array(z.string()),
});
const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  points: z.array(z.string()),
  examples: z.array(z.object({ en: z.string(), zh: z.string() })),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string(),
    }),
  ),
});
const ArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string(),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  stage: z.union([z.literal(2), z.literal(3)]),
  wordCount: z.number().int().positive(),
  paragraphs: z.array(z.string()).min(1),
  glossary: z.array(z.object({ term: z.string(), zh: z.string() })),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string(),
    }),
  ),
});
const ListeningSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string(),
  level: z.enum(["A1", "A2", "B1", "B2"]),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  type: z.enum(["dialogue", "monologue"]),
  sentences: z.array(z.object({ en: z.string(), zh: z.string() })).min(3),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string(),
    }),
  ),
});

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function assertNoTabOrNewline(cell, where) {
  if (cell.includes("\t") || cell.includes("\n")) fail(`${where} 字段含制表符/换行,无法进 TSV`);
}

function checkLevel(level, where) {
  if (!LEVELS.has(level)) fail(`${where} level 必须是 ${[...LEVELS].join("/")}`);
}

function serializeJson(items) {
  const body = items.map((w) => `  ${JSON.stringify(w)}`).join(",\n");
  return `[\n${body}\n]\n`;
}

function zodCheck(schema, value, label) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) fail(`${label} zod 校验失败:${parsed.error.issues[0].path} ${parsed.error.issues[0].message}`);
}

async function listTsv(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".tsv")).sort();
  if (files.length === 0) fail(`没有找到 TSV:${dir}`);
  return files;
}

/** 目录不存在时返回空(内容按 stage 目录渐进落地,允许暂缺后续年级);存在但为空仍报错 */
async function listTsvIfAny(dir) {
  const info = await stat(dir).catch(() => null);
  if (!info || !info.isDirectory()) return [];
  return listTsv(dir);
}

// ── 词库 ─────────────────────────────────────────────────────────────

function parseVocabRow(line, file, no) {
  const cells = line.split("\t");
  if (cells.length !== VOCAB_COLUMNS.length) {
    fail(`${file}:${no} 需要 ${VOCAB_COLUMNS.length} 列,实际 ${cells.length} 列`);
  }
  const row = Object.fromEntries(VOCAB_COLUMNS.map((c, i) => [c, cells[i].trim()]));
  for (const c of VOCAB_COLUMNS) {
    if (row[c].length === 0) fail(`${file}:${no} 列 ${c} 为空`);
  }
  checkLevel(row.level, `${file}:${no}`);
  return row;
}

async function buildVocab() {
  // 跨 stage 查重:三年词库为累积制(0→3,000→6,000→10,000),term 全局唯一
  const seen = new Map();
  // 整目录重建:清掉旧布局的 vocab/stageN.json 单文件与可能的残留分片
  await rm(join(PROJECT_ROOT, "public", "data", "vocab"), { recursive: true, force: true });
  for (const spec of VOCAB_SPECS) {
    const files = await listTsvIfAny(spec.dir);
    if (files.length === 0) {
      console.log(`· 词库 stage${spec.stage} 目录暂缺,跳过`);
      continue;
    }
    const words = [];
    for (const file of files) {
      const unit = file.replace(/\.tsv$/, "");
      if (!/^u\d{2,3}$/.test(unit)) fail(`文件名 ${file} 应形如 u01.tsv(与 unit 字段一致)`);
      const text = await readFile(join(spec.dir, file), "utf-8");
      const rows = text
        .split("\n")
        .map((l, i) => ({ line: l.trimEnd(), no: i + 1 }))
        .filter(({ line }) => line.length > 0)
        .map(({ line, no }) => parseVocabRow(line, file, no));
      rows.forEach((row) =>
        words.push({
          id: `${spec.prefix}${String(words.length + 1).padStart(3, "0")}`,
          term: row.term,
          phonetic: row.phonetic,
          meaning: row.meaning,
          level: row.level,
          stage: spec.stage,
          unit,
          examples: [{ en: row.example_en, zh: row.example_zh }],
          tags: row.tags.split("|").map((t) => t.trim()).filter(Boolean),
        }),
      );
    }

    for (const w of words) {
      const key = w.term.toLowerCase();
      if (seen.has(key)) {
        fail(`term 重复:${w.term}(stage${spec.stage} ${w.unit} 与 ${seen.get(key)})`);
      }
      seen.set(key, `stage${spec.stage} ${w.unit}`);
    }
    zodCheck(z.array(WordSchema), words, `词库 stage${spec.stage}`);
    await writeVocabSharded(spec.stage, words);
  }
  if (seen.size === 0) fail(`没有任何词库 TSV(${VOCAB_SPECS.map((s) => s.dir).join(", ")})`);
}

async function importVocab(json) {
  const words = z.array(WordSchema).parse(json);
  // --import 仅用于一次性迁移,词库统一落到 stage1 目录
  const dir = VOCAB_SPECS[0].dir;
  await mkdir(dir, { recursive: true });
  const byUnit = new Map();
  for (const w of words) {
    if (!byUnit.has(w.unit)) byUnit.set(w.unit, []);
    byUnit.get(w.unit).push(w);
  }
  for (const [unit, ws] of byUnit) {
    const lines = ws.map((w) =>
      [w.term, w.phonetic, w.meaning, w.level, w.examples[0].en, w.examples[0].zh, w.tags.join("|")]
        .map((cell) => {
          assertNoTabOrNewline(cell, w.id);
          return cell;
        })
        .join("\t"),
    );
    await writeFile(join(dir, `${unit}.tsv`), `${lines.join("\n")}\n`, "utf-8");
  }
  console.log(`✓ 词库 ${words.length} 词 → ${byUnit.size} 个 TSV(${dir})`);
}

// ── 语法课程 ─────────────────────────────────────────────────────────

function parseLesson(text, file) {
  const meta = { points: [], examples: [] };
  const questions = [];
  text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .forEach((line, idx) => {
      const no = idx + 1;
      if (line.startsWith("#")) {
        const cells = line.slice(1).trim().split("\t");
        const [key, ...values] = cells.map((c) => c.trim());
        switch (key) {
          case "title":
          case "summary":
          case "level":
            if (values.length !== 1 || values[0].length === 0) fail(`${file}:${no} # ${key} 需要 1 个非空值`);
            meta[key] = values[0];
            break;
          case "points":
            if (values.length !== 1) fail(`${file}:${no} # points 需要 1 个值(用 | 分隔多个知识点)`);
            meta.points = values[0].split("|").map((p) => p.trim()).filter(Boolean);
            break;
          case "example":
            if (values.length !== 2 || values.some((v) => v.length === 0)) fail(`${file}:${no} # example 需要英文+中文 2 列`);
            meta.examples.push({ en: values[0], zh: values[1] });
            break;
          default:
            fail(`${file}:${no} 未知指令 # ${key}`);
        }
        return;
      }
      const cells = line.split("\t");
      questions.push(parseQuestionRow(cells, file, no));
    });

  for (const key of ["title", "summary", "level"]) {
    if (!meta[key]) fail(`${file} 缺少 # ${key} 指令`);
  }
  checkLevel(meta.level, file);
  if (meta.points.length === 0) fail(`${file} 缺少 # points`);
  if (meta.examples.length === 0) fail(`${file} 缺少 # example`);
  if (questions.length !== QUESTIONS_PER_LESSON) {
    fail(`${file} 需要 ${QUESTIONS_PER_LESSON} 题,实际 ${questions.length} 题`);
  }
  return { ...meta, questions };
}

/** 题目行:题干  选项1|选项2|…  答案序号(1 起)  解析 */
function parseQuestionRow(cells, file, no) {
  if (cells.length !== 4) fail(`${file}:${no} 题目行需要 4 列(题干/选项/答案序号/解析),实际 ${cells.length} 列`);
  const [prompt, optionsCell, answerNo, explanation] = cells.map((c) => c.trim());
  if (!prompt || !explanation) fail(`${file}:${no} 题干或解析为空`);
  const options = optionsCell.split("|").map((o) => o.trim());
  if (options.length < 2 || new Set(options).size !== options.length) fail(`${file}:${no} 选项至少 2 个且不得重复`);
  const n = Number(answerNo);
  if (!Number.isInteger(n) || n < 1 || n > options.length) {
    fail(`${file}:${no} 答案序号须为 1–${options.length}(1 起始)`);
  }
  return { prompt, options, answerIndex: n - 1, explanation };
}

async function buildGrammar() {
  const lessons = [];
  const ids = new Set();
  for (const spec of GRAMMAR_SPECS) {
    const files = await listTsvIfAny(spec.dir);
    if (files.length === 0) {
      console.log(`· 语法 stage${spec.stage} 目录暂缺,跳过`);
      continue;
    }
    for (const file of sortBySeq(files, `g-${spec.stage}`)) {
      const id = file.replace(/\.tsv$/, "");
      // stage 目录决定 id 首段数字:stage1 → g-1xx;批量生成后编号可达 5 位(g-11000)
      if (!new RegExp(`^g-${spec.stage}\\d{2,5}$`).test(id)) {
        fail(`文件名 ${file} 应形如 g-${spec.stage}01.tsv(与课程 id、所在 stage 一致)`);
      }
      if (ids.has(id)) fail(`课程 id 重复:${id}`);
      ids.add(id);
      const parsed = parseLesson(
        (await readFile(join(spec.dir, file), "utf-8")).replace(/\r/g, ""),
        file,
      );
      lessons.push({
        id,
        title: parsed.title,
        summary: parsed.summary,
        level: parsed.level,
        stage: spec.stage,
        points: parsed.points,
        examples: parsed.examples,
        questions: parsed.questions.map((q, i) => ({ id: `${id}-q${i + 1}`, ...q })),
      });
    }
  }
  if (lessons.length === 0) fail(`没有任何语法课程 TSV(${GRAMMAR_SPECS.map((s) => s.dir).join(", ")})`);
  zodCheck(z.array(LessonSchema), lessons, "语法课程");
  await writeChunked(
    join(PROJECT_ROOT, "public", "data", "grammar"),
    lessons,
    (l) => ({
      id: l.id,
      title: l.title,
      summary: l.summary,
      level: l.level,
      stage: l.stage,
      questionCount: l.questions.length,
    }),
    "语法",
  );
}

async function importGrammar(json) {
  const lessons = z.array(LessonSchema).parse(json);
  for (const l of lessons) {
    const dir = GRAMMAR_SPECS.find((s) => s.stage === l.stage)?.dir;
    if (!dir) fail(`课程 ${l.id} 的 stage=${l.stage} 没有对应目录`);
    await mkdir(dir, { recursive: true });
    const lines = [
      `# title\t${l.title}`,
      `# summary\t${l.summary}`,
      `# level\t${l.level}`,
      `# points\t${l.points.join("|")}`,
      ...l.examples.map((ex) => `# example\t${ex.en}\t${ex.zh}`),
      ...l.questions.map((q) =>
        [q.prompt, q.options.join("|"), String(q.answerIndex + 1), q.explanation]
          .map((cell) => {
            assertNoTabOrNewline(cell, `${l.id} 题 ${q.id}`);
            return cell;
          })
          .join("\t"),
      ),
    ];
    await writeFile(join(dir, `${l.id}.tsv`), `${lines.join("\n")}\n`, "utf-8");
  }
  console.log(`✓ 语法 ${lessons.length} 课 → TSV(${GRAMMAR_SPECS.map((s) => s.dir).join(" + ")})`);
}

// ── 阅读短文 ─────────────────────────────────────────────────────────

function parseArticle(text, file) {
  const meta = { paragraphs: [], glossary: [] };
  const questions = [];
  text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .forEach((line, idx) => {
      const no = idx + 1;
      if (line.startsWith("#")) {
        const cells = line.slice(1).trim().split("\t");
        const [key, ...values] = cells.map((c) => c.trim());
        switch (key) {
          case "title":
          case "topic":
          case "summary":
          case "level":
            if (values.length !== 1 || values[0].length === 0) fail(`${file}:${no} # ${key} 需要 1 个非空值`);
            meta[key] = values[0];
            break;
          case "para":
            if (values.length !== 1 || values[0].length === 0) fail(`${file}:${no} # para 需要 1 个非空段落`);
            meta.paragraphs.push(values[0]);
            break;
          case "glossary":
            if (values.length !== 2 || values.some((v) => v.length === 0)) fail(`${file}:${no} # glossary 需要词汇+中文 2 列`);
            meta.glossary.push({ term: values[0], zh: values[1] });
            break;
          default:
            fail(`${file}:${no} 未知指令 # ${key}`);
        }
        return;
      }
      questions.push(parseQuestionRow(line.split("\t"), file, no));
    });

  for (const key of ["title", "topic", "summary", "level"]) {
    if (!meta[key]) fail(`${file} 缺少 # ${key} 指令`);
  }
  checkLevel(meta.level, file);
  if (meta.paragraphs.length === 0) fail(`${file} 缺少 # para`);
  if (meta.glossary.length === 0) fail(`${file} 缺少 # glossary`);
  if (questions.length < 3 || questions.length > 8) {
    fail(`${file} 需要 3–8 题,实际 ${questions.length} 题`);
  }
  return { ...meta, questions };
}

async function buildReading() {
  let built = 0;
  for (const spec of READING_SPECS) {
    const files = await listTsvIfAny(spec.dir);
    if (files.length === 0) {
      console.log(`· 阅读 l${spec.stage} 目录暂缺,跳过`);
      continue;
    }
    const articles = await Promise.all(sortBySeq(files, `r${spec.stage}-`).map(async (file) => {
      const id = file.replace(/\.tsv$/, "");
      if (!new RegExp(`^r${spec.stage}-\\d{2,4}$`).test(id)) {
        fail(`文件名 ${file} 应形如 r${spec.stage}-01.tsv(与文章 id、所在 stage 一致)`);
      }
      const parsed = parseArticle(
        (await readFile(join(spec.dir, file), "utf-8")).replace(/\r/g, ""),
        file,
      );
      return {
        id,
        title: parsed.title,
        topic: parsed.topic,
        summary: parsed.summary,
        level: parsed.level,
        stage: spec.stage,
        wordCount: parsed.paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
        paragraphs: parsed.paragraphs,
        glossary: parsed.glossary,
        questions: parsed.questions.map((q, i) => ({ id: `${id}-q${i + 1}`, ...q })),
      };
    }));
    zodCheck(z.array(ArticleSchema), articles, `阅读素材 l${spec.stage}`);
    await writeChunked(
      dirname(spec.json),
      articles,
      (a) => ({
        id: a.id,
        title: a.title,
        topic: a.topic,
        summary: a.summary,
        level: a.level,
        stage: a.stage,
        wordCount: a.wordCount,
        questionCount: a.questions.length,
      }),
      `阅读 l${spec.stage}`,
    );
    built += files.length;
  }
  if (built === 0) fail(`没有任何阅读 TSV(${READING_SPECS.map((s) => s.dir).join(", ")})`);
}

async function importReading(json) {
  const articles = z.array(ArticleSchema).parse(json);
  for (const a of articles) {
    const spec = READING_SPECS.find((s) => s.stage === a.stage);
    if (!spec) fail(`文章 ${a.id} 的 stage=${a.stage} 没有对应目录`);
    await mkdir(spec.dir, { recursive: true });
    const lines = [
      `# title\t${a.title}`,
      `# topic\t${a.topic}`,
      `# summary\t${a.summary}`,
      `# level\t${a.level}`,
      ...a.paragraphs.map((p) => `# para\t${p}`),
      ...a.glossary.map((g) => `# glossary\t${g.term}\t${g.zh}`),
      ...a.questions.map((q) =>
        [q.prompt, q.options.join("|"), String(q.answerIndex + 1), q.explanation]
          .map((cell) => {
            assertNoTabOrNewline(cell, `${a.id} 题 ${q.id}`);
            return cell;
          })
          .join("\t"),
      ),
    ];
    await writeFile(join(spec.dir, `${a.id}.tsv`), `${lines.join("\n")}\n`, "utf-8");
  }
  console.log(`✓ 阅读 ${articles.length} 篇 → TSV(${READING_SPECS.map((s) => s.dir).join(" + ")})`);
}

// ── 听力精听素材 ─────────────────────────────────────────────────────

function parseListening(text, file) {
  const meta = { sentences: [] };
  const questions = [];
  text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .forEach((line, idx) => {
      const no = idx + 1;
      if (line.startsWith("#")) {
        const cells = line.slice(1).trim().split("\t");
        const [key, ...values] = cells.map((c) => c.trim());
        switch (key) {
          case "title":
          case "topic":
          case "summary":
          case "level":
          case "type":
            if (values.length !== 1 || values[0].length === 0) fail(`${file}:${no} # ${key} 需要 1 个非空值`);
            meta[key] = values[0];
            break;
          case "s":
            if (values.length !== 2 || values.some((v) => v.length === 0)) fail(`${file}:${no} # s 需要英文+中文 2 列`);
            meta.sentences.push({ en: values[0], zh: values[1] });
            break;
          default:
            fail(`${file}:${no} 未知指令 # ${key}`);
        }
        return;
      }
      questions.push(parseQuestionRow(line.split("\t"), file, no));
    });

  for (const key of ["title", "topic", "summary", "level", "type"]) {
    if (!meta[key]) fail(`${file} 缺少 # ${key} 指令`);
  }
  checkLevel(meta.level, file);
  if (meta.type !== "dialogue" && meta.type !== "monologue") {
    fail(`${file} # type 必须是 dialogue/monologue`);
  }
  if (meta.sentences.length < 3 || meta.sentences.length > 10) {
    fail(`${file} 需要 3–10 句,实际 ${meta.sentences.length} 句`);
  }
  if (questions.length < 3 || questions.length > 5) {
    fail(`${file} 需要 3–5 题,实际 ${questions.length} 题`);
  }
  return { ...meta, questions };
}

async function buildListening() {
  const items = [];
  const ids = new Set();
  for (const spec of LISTENING_SPECS) {
    const files = await listTsvIfAny(spec.dir);
    if (files.length === 0) {
      console.log(`· 听力 l${spec.stage} 目录暂缺,跳过`);
      continue;
    }
    for (const file of sortBySeq(files, `ls${spec.stage}-`)) {
      const id = file.replace(/\.tsv$/, "");
      if (!new RegExp(`^ls${spec.stage}-\\d{2,4}$`).test(id)) {
        fail(`文件名 ${file} 应形如 ls${spec.stage}-01.tsv(与素材 id、所在 stage 一致)`);
      }
      if (ids.has(id)) fail(`听力素材 id 重复:${id}`);
      ids.add(id);
      const parsed = parseListening(
        (await readFile(join(spec.dir, file), "utf-8")).replace(/\r/g, ""),
        file,
      );
      items.push({
        id,
        title: parsed.title,
        topic: parsed.topic,
        summary: parsed.summary,
        level: parsed.level,
        stage: spec.stage,
        type: parsed.type,
        sentences: parsed.sentences,
        questions: parsed.questions.map((q, i) => ({ id: `${id}-q${i + 1}`, ...q })),
      });
    }
  }
  if (items.length === 0) fail(`没有任何听力素材 TSV(${LISTENING_SPECS.map((s) => s.dir).join(", ")})`);
  zodCheck(z.array(ListeningSchema), items, "听力素材");
  await writeChunked(
    join(PROJECT_ROOT, "public", "data", "listening"),
    items,
    (i) => ({
      id: i.id,
      title: i.title,
      topic: i.topic,
      summary: i.summary,
      level: i.level,
      stage: i.stage,
      type: i.type,
      sentenceCount: i.sentences.length,
      questionCount: i.questions.length,
    }),
    "听力",
  );
}

// ── 入口 ─────────────────────────────────────────────────────────────

const importArg = process.argv.indexOf("--import");
if (importArg !== -1) {
  const path = process.argv[importArg + 1];
  if (!path) fail("--import 需要一个 JSON 路径");
  const json = JSON.parse(await readFile(path, "utf-8"));
  const first = Array.isArray(json) ? json[0] : undefined;
  if (first && "paragraphs" in first) await importReading(json);
  else if (first && "questions" in first) await importGrammar(json);
  else await importVocab(json);
} else {
  await buildVocab();
  await buildGrammar();
  await buildReading();
  await buildListening();
}
