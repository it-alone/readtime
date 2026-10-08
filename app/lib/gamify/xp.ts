import type { ItemResult } from "~/models/types";

// XP 规则(见 ARCHITECTURE.md §6.3):新词 10/词、复习通过 5/词、会话完成 +20、
// 听力巩固 3/题、语法练习 3/题、阅读理解 3/题、发音跟读 3/题、测评 +100

export const XP_RULES = {
  NEW_WORD: 10,
  REVIEW_PASS: 5,
  SESSION_COMPLETE: 20,
  LISTENING_CORRECT: 3,
  GRAMMAR_CORRECT: 3,
  READING_CORRECT: 3,
  PRON_CORRECT: 3,
  ASSESSMENT: 100,
} as const;

export function computeSessionXp(results: ItemResult[]): number {
  const itemXp = results.reduce((sum, r) => {
    // 新词按"学过"计分(答错也会进入 SM-2 复习队列,视同完成学习);
    // 复习词需答对(grade ≥ 3)才计分
    if (r.kind === "new") return sum + XP_RULES.NEW_WORD;
    return sum + (r.correct ? XP_RULES.REVIEW_PASS : 0);
  }, 0);
  return results.length > 0 ? itemXp + XP_RULES.SESSION_COMPLETE : 0;
}

/** 听力巩固:不影响 SM-2 与词库指针,答对按题计 XP + 会话完成奖励 */
export function computeListeningXp(results: ItemResult[]): number {
  const itemXp = results.filter((r) => r.correct).length * XP_RULES.LISTENING_CORRECT;
  return results.length > 0 ? itemXp + XP_RULES.SESSION_COMPLETE : 0;
}

/**
 * 语法练习:答对按题计 XP;仅首次完成该课时给会话完成奖励,
 * 重复练习只按题计分,避免刷分。
 */
export function computeGrammarXp(
  correctCount: number,
  total: number,
  firstCompletion: boolean
): number {
  if (total === 0) return 0;
  const itemXp = correctCount * XP_RULES.GRAMMAR_CORRECT;
  return firstCompletion ? itemXp + XP_RULES.SESSION_COMPLETE : itemXp;
}

/**
 * 阅读理解:与语法同口径——答对按题计 XP,仅首次完成该篇给会话完成奖励,
 * 重复阅读只按题计分,避免刷分。
 */
export function computeReadingXp(
  correctCount: number,
  total: number,
  firstCompletion: boolean
): number {
  if (total === 0) return 0;
  const itemXp = correctCount * XP_RULES.READING_CORRECT;
  return firstCompletion ? itemXp + XP_RULES.SESSION_COMPLETE : itemXp;
}

/** 发音跟读:读对(≥及格分)3/句 + 完成 +20,与听力同口径 */
export function computePronXp(correctCount: number, total: number): number {
  if (total === 0) return 0;
  return correctCount * XP_RULES.PRON_CORRECT + XP_RULES.SESSION_COMPLETE;
}
