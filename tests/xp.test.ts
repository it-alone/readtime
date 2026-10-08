import { describe, expect, it } from "vitest";
import {
  computeSessionXp,
  computeListeningXp,
  computeGrammarXp,
  computeReadingXp,
  computePronXp,
  XP_RULES,
} from "~/lib/gamify/xp";
import type { ItemResult } from "~/models/types";

function r(kind: "new" | "review", correct: boolean): ItemResult {
  return {
    wordId: "w-1",
    kind,
    grade: correct ? 5 : 2,
    correct,
    elapsedMs: 1000,
  };
}

describe("XP 规则", () => {
  it("词汇会话:新词无论对错 10/词(答错也进入复习队列)、复习通过 5/词、完成 +20", () => {
    const results = [r("new", true), r("new", true), r("new", false), r("review", true)];
    expect(computeSessionXp(results)).toBe(10 + 10 + 10 + 5 + XP_RULES.SESSION_COMPLETE);
  });

  it("空结果不计会话完成奖励", () => {
    expect(computeSessionXp([])).toBe(0);
    expect(computeListeningXp([])).toBe(0);
  });

  it("听力会话:答对 3/题 + 完成 +20,答错不计", () => {
    const results = [r("review", true), r("review", true), r("review", false)];
    expect(computeListeningXp(results)).toBe(3 + 3 + 0 + XP_RULES.SESSION_COMPLETE);
  });

  it("语法练习:首次完成给完成奖励,重复练习只按题计分", () => {
    expect(computeGrammarXp(5, 6, true)).toBe(5 * 3 + XP_RULES.SESSION_COMPLETE);
    expect(computeGrammarXp(5, 6, false)).toBe(5 * 3);
    expect(computeGrammarXp(0, 0, true)).toBe(0);
  });

  it("阅读理解:与语法同口径,首次完成给完成奖励,重复只按题计分", () => {
    expect(computeReadingXp(4, 5, true)).toBe(4 * 3 + XP_RULES.SESSION_COMPLETE);
    expect(computeReadingXp(4, 5, false)).toBe(4 * 3);
    expect(computeReadingXp(0, 0, true)).toBe(0);
  });

  it("发音训练:达标 3/句 + 完成 +20,每次练习都给完成奖励", () => {
    expect(computePronXp(3, 5)).toBe(3 * 3 + XP_RULES.SESSION_COMPLETE);
    expect(computePronXp(5, 5)).toBe(5 * 3 + XP_RULES.SESSION_COMPLETE);
  });
});
