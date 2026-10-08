// 发音播放(两层策略,修复"语音模糊不清"):
//   1. 优先播放离线音频包 /audio/**(由 scripts/generate-audio.mjs 用系统神经语音预生成,
//      音质稳定、与设备无关;URL 约定见下方 *AudioUrl);
//   2. 音频包缺失或解码失败时,回退浏览器 SpeechSynthesis——精选清晰嗓音,
//      过滤 macOS 系统自带的玩具/机械语音(Fred、Zarvox、Whisper 等)。
// 学习数据不经此处;音频文件由 Service Worker 运行时缓存(cache-first)。

let currentAudio: HTMLAudioElement | null = null;
let cachedVoice: SpeechSynthesisVoice | null | undefined;

// —— 音频包 URL 约定(与 scripts/generate-audio.mjs 保持一致) ──────────────────
// BASE_URL 前缀:子路径部署(GitHub Pages /readtime/)下音频也在子路径下。
const AUDIO_BASE = `${import.meta.env.BASE_URL}audio/`;

/** 单词发音:public/audio/vocab/{wordId}.m4a */
export function wordAudioUrl(wordId: string): string {
  return `${AUDIO_BASE}vocab/${wordId}.m4a`;
}

/** 词例句发音:public/audio/vocab/{wordId}-ex.m4a */
export function exampleAudioUrl(wordId: string): string {
  return `${AUDIO_BASE}vocab/${wordId}-ex.m4a`;
}

/** 文章整句发音:index 为段落号×100+句序(与 pron 调度的 PronDrillItem 编号一致) */
export function readingSentenceAudioUrl(articleId: string, index: number): string {
  return `${AUDIO_BASE}reading/${articleId}/s${index}.m4a`;
}

/** 听力素材整句发音:index 为 1 起句序(与 generate-audio 的 listening 输出一致) */
export function listeningSentenceAudioUrl(itemId: string, index: number): string {
  return `${AUDIO_BASE}listening/${itemId}/s${index}.m4a`;
}

/** 发音跟读条目的音频:词例句按词 id,文章句的 wordId 形如 "r2-01#s103" */
export function drillAudioUrl(item: {
  wordId: string;
  source: "vocab" | "reading";
}): string | undefined {
  if (item.source === "vocab") return exampleAudioUrl(item.wordId);
  const hash = item.wordId.indexOf("#");
  if (hash < 0) return undefined;
  return readingSentenceAudioUrl(
    item.wordId.slice(0, hash),
    Number(item.wordId.slice(hash + 2))
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function speak(text: string, rate = 1, audioUrl?: string): void {
  stop();
  if (typeof window === "undefined") return;
  if (audioUrl) {
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    let fellBack = false;
    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      if (currentAudio === audio) currentAudio = null;
      speakWithTts(text, rate);
    };
    audio.addEventListener("error", fallback);
    audio.playbackRate = rate;
    audio.play().catch(fallback);
    return;
  }
  speakWithTts(text, rate);
}

/**
 * 可等待的播放:音频包播完或 TTS 朗读结束(失败/被打断)后 resolve。
 * 全篇连播的 TTS 回退必须用它逐句等待——fire-and-forget 的 speak() 会在
 * 下一句开始时 cancel() 掉上一句,导致连续缺音频的句子互相打断。
 */
export function speakAsync(text: string, rate = 1, audioUrl?: string): Promise<void> {
  stop();
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (currentAudio === audio) currentAudio = null;
        resolve();
      };
      const fallback = () => {
        if (settled) return;
        settled = true;
        if (currentAudio === audio) currentAudio = null;
        speakWithTts(text, rate).then(resolve, resolve);
      };
      audio.addEventListener("ended", settle, { once: true });
      audio.addEventListener("error", fallback, { once: true });
      audio.playbackRate = rate;
      audio.play().catch(fallback);
      return;
    }
    speakWithTts(text, rate).then(resolve, resolve);
  });
}

export function stop(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// ── TTS 回退:嗓音精选 ────────────────────────────────────────────────────────

// macOS 自带的玩具/机械语音,读了也不清楚,一律排除
const NOVELTY_VOICE =
  /bad news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|albert|ralph|junior|grandma|grandpa|eddy|flo|rocko/i;

// 按清晰度排序的优选名单(子串匹配,不区分大小写;前缀序号仅作排序依据)
const PREFERRED_VOICES = [
  "google us english",
  "google uk english female",
  "microsoft aria",
  "microsoft jenny",
  "microsoft guy",
  "microsoft zira",
  "microsoft david",
  "reed",
  "sandy",
  "shelley",
  "samantha",
  "kathy",
  "daniel",
  "moira",
  "karen",
  "tessa",
];

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const english = voices.filter(
    (v) => v.lang.toLowerCase().startsWith("en") && !NOVELTY_VOICE.test(v.name)
  );
  if (english.length === 0) return null;
  for (const wanted of PREFERRED_VOICES) {
    const hit = english.find((v) => v.name.toLowerCase().includes(wanted));
    if (hit) return hit;
  }
  return english.find((v) => v.lang.toLowerCase().startsWith("en-us")) ?? english[0];
}

function speakWithTts(text: string, rate: number): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return Promise.resolve();
  }
  // 嗓音列表异步加载:拿不到时先播(系统默认),加载完成后再精选
  if (cachedVoice === undefined && window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener(
      "voiceschanged",
      () => {
        cachedVoice = pickVoice();
      },
      { once: true }
    );
  } else {
    cachedVoice = pickVoice();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  if (cachedVoice) {
    utterance.voice = cachedVoice;
    utterance.lang = cachedVoice.lang;
  }
  return new Promise((resolve) => {
    // onend/onerror 都放行(含被 cancel() 打断的情形),不让等待方悬挂
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}
