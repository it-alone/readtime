import { describe, expect, it } from "vitest";
import { computeRetentionRate, retentionSamples } from "~/lib/diagnosis/retention";
import type { LearningSession } from "~/models/types";

function session(items: { kind: "new" | "review"; grade: number }[]): LearningSession {
  return {
    id: `s-${Math.random()}`,
    type: "vocab",
    startedAt: "2026-09-29T10:00:00Z",
    endedAt: "2026-09-29T10:20:00Z",
    items: items.map((i, n) => ({
      wordId: `w-${n}`,
      kind: i.kind,
      grade: i.grade as LearningSession["items"][number]["grade"],
      elapsedMs: 1000,
    })),
    xpEarned: 0,
  };
}

describe("复习留存率诊断", () => {
  it("样本不足时返回 undefined,不触发自适应", () => {
    const sessions = [session([{ kind: "review", grade: 5 }, { kind: "review", grade: 2 }])];
    expect(computeRetentionRate(sessions)).toBeUndefined();
  });

  it("只统计复习题,新词题不计入样本", () => {
    const sessions = [
      session(Array.from({ length: 10 }, (_, i) => ({ kind: "new" as const, grade: 5 }))),
    ];
    expect(computeRetentionRate(sessions)).toBeUndefined();
    expect(retentionSamples(sessions)).toBe(0);
  });

  it("grade >= 3 计为正确", () => {
    const reviews = [
      { kind: "review" as const, grade: 5 },
      { kind: "review" as const, grade: 4 },
      { kind: "review" as const, grade: 3 },
      { kind: "review" as const, grade: 2 },
      ...Array.from({ length: 6 }, () => ({ kind: "review" as const, grade: 5 })),
    ];
    const sessions = [session(reviews), session(Array.from({ length: 4 }, () => ({ kind: "new" as const, grade: 5 })))];
    expect(computeRetentionRate(sessions)).toBe(9 / 10);
    expect(retentionSamples(sessions)).toBe(10);
  });

  it("跨会话聚合", () => {
    const sessions = [
      session(Array.from({ length: 6 }, () => ({ kind: "review" as const, grade: 5 }))),
      session([
        ...Array.from({ length: 3 }, () => ({ kind: "review" as const, grade: 2 })),
        { kind: "review" as const, grade: 5 },
      ]),
    ];
    expect(computeRetentionRate(sessions)).toBe(7 / 10);
  });

  it("听写/精听等非词汇会话不计入(其 review 项不经过 SM-2,混入会失真)", () => {
    const listening: LearningSession = {
      ...session(Array.from({ length: 10 }, () => ({ kind: "review" as const, grade: 5 }))),
      type: "listening-dictation",
    };
    expect(computeRetentionRate([listening])).toBeUndefined();
    expect(retentionSamples([listening])).toBe(0);
  });
});
