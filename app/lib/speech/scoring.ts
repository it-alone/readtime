// 跟读评分(纯函数,前后端通用):
// 把识别到的转写与目标句做词级多重集匹配,0-100 总分 + 词级命中明细。
// 口径对齐 ARCHITECTURE.md §6.4 PronScore(overall/wordAccuracies/engine),
// 阶段 3 换服务端音素级评分时 overall 定义不变,历史分数可比。

export interface PronScore {
  /** 0-100 总分,对齐 PLAN 的 85/88/90+ 指标 */
  overall: number;
  /** 词级准确率:命中 100 / 未命中 0(音素级评分接入后按词聚合) */
  wordAccuracies: { word: string; score: number }[];
  /** 阶段 0 为 web-speech;阶段 3 换 server-ai */
  engine: "web-speech" | "server-ai";
}

/** 反馈面板摘要:目标词总数、命中数与未命中词列表 */
export function summarizePronScore(score: PronScore): {
  total: number;
  matched: number;
  missed: string[];
} {
  const missed = score.wordAccuracies.filter((w) => w.score === 0).map((w) => w.word);
  return { total: score.wordAccuracies.length, matched: score.wordAccuracies.length - missed.length, missed };
}

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function scoreSpeech(target: string, said: string): PronScore {
  const targetWords = normalize(target);
  const saidWords = normalize(said);
  if (targetWords.length === 0) {
    return { overall: 0, wordAccuracies: [], engine: "web-speech" };
  }

  const saidPool = new Map<string, number>();
  for (const w of saidWords) saidPool.set(w, (saidPool.get(w) ?? 0) + 1);

  const wordAccuracies = targetWords.map((w) => {
    const left = saidPool.get(w) ?? 0;
    if (left > 0) {
      saidPool.set(w, left - 1);
      return { word: w, score: 100 };
    }
    return { word: w, score: 0 };
  });
  const matched = wordAccuracies.filter((w) => w.score > 0).length;
  return {
    overall: Math.round((matched / targetWords.length) * 100),
    wordAccuracies,
    engine: "web-speech",
  };
}

/** 及格线:60 分及以上记为"读对"(XP 与会话 grade 口径) */
export const PRON_PASS_SCORE = 60;
