import { describe, expect, it } from "vitest";
import {
  buildPronDrill,
  collectReadingSentences,
  splitSentences,
  PRON_DRILL_SIZE,
} from "~/lib/scheduler/pron";
import type { ReadingArticle, VocabWord } from "~/models/types";

// 发音跟读选句:词例句 + 已读文章整句两路素材,缺额互补、按种子确定

function word(n: number): VocabWord {
  return {
    id: `w-s1-${String(n).padStart(3, "0")}`,
    term: `word${n}`,
    phonetic: "/wɜːd/",
    meaning: `n. 词${n}`,
    level: "A1",
    stage: 1,
    unit: "u01",
    examples: [{ en: `Example sentence ${n}.`, zh: `例句${n}。` }],
    tags: ["test"],
  };
}

function article(id: string, title: string, paragraphs: string[]): ReadingArticle {
  return {
    id,
    title,
    topic: "test",
    summary: "",
    level: "A2",
    stage: 2,
    wordCount: 100,
    paragraphs,
    glossary: [],
    questions: [],
  };
}

const LONG_PARA =
  "Monday is always the busiest day of my week. I get up at six. At noon, I only have thirty minutes for lunch, so I usually buy a sandwich.";

describe("splitSentences", () => {
  it("按句末标点切分并去掉空片段", () => {
    expect(splitSentences(LONG_PARA)).toEqual([
      "Monday is always the busiest day of my week.",
      "I get up at six.",
      "At noon, I only have thirty minutes for lunch, so I usually buy a sandwich.",
    ]);
    expect(splitSentences("One.  Two! Three? ")).toEqual(["One.", "Two!", "Three?"]);
  });
});

describe("collectReadingSentences", () => {
  it("只取已读文章中词数达标的句子", () => {
    const articles = [
      article("r2-01", "Read", [LONG_PARA, "Too short. This one is fine and long enough."]),
      article("r2-02", "Unread", [LONG_PARA]),
    ];
    const sentences = collectReadingSentences(articles, ["r2-01"]);
    // "I get up at six." 5 词保留;"Too short." 2 词过短排除;
    // "At noon, … sandwich." 15 词超过 14 词上限排除;未读文章排除
    expect(sentences.map((s) => s.en)).toEqual([
      "Monday is always the busiest day of my week.",
      "I get up at six.",
      "This one is fine and long enough.",
    ]);
    expect(sentences.every((s) => s.articleId === "r2-01" && s.title === "Read")).toBe(true);
  });
});

describe("buildPronDrill", () => {
  const words = Array.from({ length: 8 }, (_, i) => word(i + 1));
  const sentences = collectReadingSentences([article("r2-01", "My Week", [LONG_PARA])], ["r2-01"]);

  it("默认 3 词例句 + 2 文章句,交替编排", () => {
    const items = buildPronDrill(words, sentences, 7);
    expect(items).toHaveLength(PRON_DRILL_SIZE);
    expect(items.filter((i) => i.source === "vocab")).toHaveLength(3);
    expect(items.filter((i) => i.source === "reading")).toHaveLength(2);
    // 交替:词、句、词、句、词
    expect(items.map((i) => i.source)).toEqual(["vocab", "reading", "vocab", "reading", "vocab"]);
    // 文章句:无译文,wordId 带文章定位,term 是标题
    const reading = items.find((i) => i.source === "reading")!;
    expect(reading.sentence.zh).toBe("");
    expect(reading.wordId).toMatch(/^r2-01#s\d+$/);
    expect(reading.term).toBe("My Week");
  });

  it("阅读句不足时名额让给词例句,没有阅读句则回到纯词例句", () => {
    const one = buildPronDrill(words, sentences.slice(0, 1), 7);
    expect(one).toHaveLength(PRON_DRILL_SIZE);
    expect(one.filter((i) => i.source === "vocab")).toHaveLength(4);
    expect(one.filter((i) => i.source === "reading")).toHaveLength(1);

    const none = buildPronDrill(words, [], 7);
    expect(none).toHaveLength(PRON_DRILL_SIZE);
    expect(none.every((i) => i.source === "vocab")).toBe(true);
  });

  it("同 seed 结果确定,不同 seed 选择不同", () => {
    const a = buildPronDrill(words, sentences, 42);
    const b = buildPronDrill(words, sentences, 42);
    const c = buildPronDrill(words, sentences, 43);
    expect(a.map((i) => i.wordId)).toEqual(b.map((i) => i.wordId));
    expect(a.map((i) => i.wordId)).not.toEqual(c.map((i) => i.wordId));
  });

  it("没有例句的词被过滤,不进入跟读", () => {
    const noExample = { ...word(1), examples: [] };
    const items = buildPronDrill([noExample], [], 7);
    expect(items).toHaveLength(0);
  });
});
