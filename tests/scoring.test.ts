import { describe, expect, it } from "vitest";
import { PRON_PASS_SCORE, scoreSpeech, summarizePronScore } from "~/lib/speech/scoring";

// 跟读评分:词级多重集匹配,大小写/标点不敏感;PronScore 口径见 ARCHITECTURE.md §6.4

describe("scoreSpeech", () => {
  it("完全读对得满分", () => {
    const s = scoreSpeech("I love English", "I love English");
    expect(s.overall).toBe(100);
    expect(s.engine).toBe("web-speech");
    expect(summarizePronScore(s)).toMatchObject({ total: 3, matched: 3, missed: [] });
  });

  it("大小写与标点不影响匹配", () => {
    expect(scoreSpeech("Don't shout!", "don't Shout").overall).toBe(100);
  });

  it("漏词按比例扣分,并列出漏掉的词", () => {
    const s = scoreSpeech("I went to school yesterday", "I went to school");
    expect(s.overall).toBe(80);
    expect(summarizePronScore(s)).toMatchObject({ total: 5, matched: 4, missed: ["yesterday"] });
  });

  it("重复词按多重集计,多说不能白拿分", () => {
    // 目标里两个 "very",转写只说一次:只命中一次
    const partial = scoreSpeech("It is very very good", "it is very good");
    expect(summarizePronScore(partial).matched).toBe(4);
    expect(partial.overall).toBe(80);
    // 转写把 "good" 重复两遍也不能补上缺的 "very"
    const padded = scoreSpeech("It is very very good", "it is good good very");
    expect(summarizePronScore(padded).matched).toBe(4);
  });

  it("词级明细:命中记 100,未命中记 0", () => {
    const s = scoreSpeech("one two three", "one x three");
    expect(s.wordAccuracies).toEqual([
      { word: "one", score: 100 },
      { word: "two", score: 0 },
      { word: "three", score: 100 },
    ]);
  });

  it("没读出来是 0 分,远低于及格线", () => {
    const s = scoreSpeech("Good morning teacher", "hello world");
    expect(s.overall).toBe(0);
    expect(s.overall).toBeLessThan(PRON_PASS_SCORE);
  });

  it("及格线为 60 分:四句对三句达标,对两句不达标", () => {
    expect(scoreSpeech("one two three four", "one two three x").overall).toBeGreaterThanOrEqual(PRON_PASS_SCORE);
    expect(scoreSpeech("one two three four", "one two x x").overall).toBeLessThan(PRON_PASS_SCORE);
  });
});
