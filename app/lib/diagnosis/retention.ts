import type { LearningSession } from "~/models/types";

// 复习留存率诊断(见 ARCHITECTURE.md §6.5 / PLAN.md 风险应对):
// 近期复习题的正确比例;< 0.8 时每日调度器自动减半新词量。
// 只统计词汇会话(type=vocab)的复习项——听写/精听/语法/阅读会话虽然也把
// 结果记成 kind=review,但不经过 SM-2 调度,混入会抬高/压低留存率,
// 导致"减新词"自适应与周报留存率失真。
// 样本不足时返回 undefined,不触发自适应。

const VOCAB_SESSION = "vocab";

export function computeRetentionRate(
  sessions: LearningSession[],
  minSamples = 10
): number | undefined {
  const reviewItems = vocabReviewItems(sessions);
  if (reviewItems.length < minSamples) return undefined;
  const correct = reviewItems.filter((i) => (i.grade ?? 0) >= 3).length;
  return correct / reviewItems.length;
}

export function retentionSamples(sessions: LearningSession[]): number {
  return vocabReviewItems(sessions).length;
}

function vocabReviewItems(sessions: LearningSession[]) {
  return sessions
    .filter((s) => s.type === VOCAB_SESSION)
    .flatMap((s) => s.items.filter((i) => i.kind === "review"));
}
