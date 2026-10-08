import { hashString, shuffleSeeded } from "~/lib/random";
import type { ReadingArticle, VocabWord } from "~/models/types";

// 发音跟读选句(见 ARCHITECTURE.md §6.2 / PLAN.md 第 1 年发音训练):
// 素材分两路 —— 已学词(有 SM-2 状态)的第一条例句 + 已读文章里的整句(打通阅读↔发音)。
// 按日种子确定性洗牌,同一天内多次训练句子稳定;阅读句不足时名额让给词例句,反之亦然。

export const PRON_DRILL_SIZE = 5;
/** 默认 3 句词例句 + 2 句文章句 */
export const PRON_WORD_PART = 3;
export const PRON_SENTENCE_PART = 2;
/** 文章句词数上下限:太短没有训练价值,太长难以一次跟读 */
export const PRON_SENTENCE_MIN_WORDS = 4;
export const PRON_SENTENCE_MAX_WORDS = 14;
/** 还没学过任何词时,退回词库开头(跟读不要求已学,朗读本身即是练习) */
export const PRON_FALLBACK_SIZE = 5;

export interface PronDrillItem {
  /** 词例句=词 id;文章句=文章id#s序号 */
  wordId: string;
  /** 词例句=单词;文章句=文章标题 */
  term: string;
  sentence: { en: string; zh: string };
  source: "vocab" | "reading";
}

export interface PronSentenceSource {
  articleId: string;
  title: string;
  /** 段落序号 × 100 + 句子序号,保证稳定不重 */
  index: number;
  en: string;
}

/** 按句末标点切句,保留原词原标点 */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 从已读文章里收集适合跟读的句子(词数在限定区间内) */
export function collectReadingSentences(
  articles: ReadingArticle[],
  readIds: string[]
): PronSentenceSource[] {
  const read = new Set(readIds);
  return articles
    .filter((a) => read.has(a.id))
    .flatMap((a) =>
      a.paragraphs.flatMap((para, pi) =>
        splitSentences(para)
          .filter((en) => {
            const wc = en.split(/\s+/).length;
            return wc >= PRON_SENTENCE_MIN_WORDS && wc <= PRON_SENTENCE_MAX_WORDS;
          })
          .map((en, si) => ({ articleId: a.id, title: a.title, index: pi * 100 + si, en }))
      )
    );
}

export function buildPronDrill(
  words: VocabWord[],
  sentences: PronSentenceSource[],
  seed: number
): PronDrillItem[] {
  const wordPool = shuffleSeeded(words, seed)
    .filter((w) => w.examples.length > 0)
    .map((w) => ({
      wordId: w.id,
      term: w.term,
      sentence: w.examples[0],
      source: "vocab" as const,
    }));
  const sentencePool = shuffleSeeded(sentences, seed + 1).map((s) => ({
    wordId: `${s.articleId}#s${s.index}`,
    term: s.title,
    sentence: { en: s.en, zh: "" },
    source: "reading" as const,
  }));

  // 名额分配:默认 2 句文章句,不够的部分由词例句补足(总数不超过 PRON_DRILL_SIZE)
  const nSentences = Math.min(PRON_SENTENCE_PART, sentencePool.length);
  const nWords = Math.min(PRON_DRILL_SIZE - nSentences, wordPool.length);
  const pickedWords = wordPool.slice(0, nWords);
  const pickedSentences = sentencePool.slice(0, nSentences);

  // 交替编排(词、句、词、句、词),避免同来源题目扎堆
  const items: PronDrillItem[] = [];
  for (let i = 0; i < Math.max(pickedWords.length, pickedSentences.length); i++) {
    if (pickedWords[i]) items.push(pickedWords[i]);
    if (pickedSentences[i]) items.push(pickedSentences[i]);
  }
  return items;
}

/** 按日种子入口:沿用 pron-<日期> 的字符串种子约定 */
export function pronDailySeed(dayKey: string): number {
  return hashString(dayKey);
}
