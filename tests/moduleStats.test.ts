import { describe, expect, it } from "vitest";
import { summarizeModules } from "~/lib/diagnosis/modules";
import type { Grade, LearningSession, SessionItem } from "~/models/types";

// 模块训练汇总:窗口过滤 + 五模块零值兜底 + grade>=3 计正确(与留存率同口径)

const NOW = new Date("2026-09-29T12:00:00+08:00");
const DAY_MS = 86_400_000;

function item(kind: SessionItem["kind"], grade: Grade): SessionItem {
  return { wordId: "q-1", kind, grade, elapsedMs: 1000 };
}

function session(
  id: string,
  type: LearningSession["type"],
  startedAt: Date,
  items: SessionItem[]
): LearningSession {
  return { id, type, startedAt: startedAt.toISOString(), endedAt: startedAt.toISOString(), items, xpEarned: 10 };
}

describe("summarizeModules", () => {
  it("空输入时五个模块全为零值,accuracy 为 undefined", () => {
    const all = summarizeModules([], NOW);
    expect(all.map((m) => m.type)).toEqual([
      "vocab",
      "grammar-quiz",
      "listening-dictation",
      "reading-quiz",
      "pron-drill",
    ]);
    expect(all.every((m) => m.sessions === 0 && m.items === 0 && m.accuracy === undefined)).toBe(true);
  });

  it("窗口内会话按模块聚合计数,grade>=3 计正确", () => {
    const inWindow = [
      session("s1", "grammar-quiz", new Date(NOW.getTime() - 2 * DAY_MS), [
        item("grammar", 5),
        item("grammar", 2),
      ]),
      session("s2", "grammar-quiz", new Date(NOW.getTime() - DAY_MS), [item("grammar", 5)]),
      session("s3", "pron-drill", NOW, [item("pron", 5), item("pron", 2), item("pron", 4)]),
    ];
    const all = summarizeModules(inWindow, NOW);
    const byType = new Map(all.map((m) => [m.type, m]));
    expect(byType.get("grammar-quiz")).toMatchObject({ sessions: 2, items: 3, correct: 2 });
    expect(byType.get("grammar-quiz")!.accuracy).toBeCloseTo(2 / 3);
    expect(byType.get("pron-drill")).toMatchObject({ sessions: 1, items: 3, correct: 2 });
    // 未练习的模块保持零值
    expect(byType.get("listening-dictation")!.sessions).toBe(0);
  });

  it("窗口外的会话被排除", () => {
    const sessions = [
      session("old", "reading-quiz", new Date(NOW.getTime() - 8 * DAY_MS), [item("reading", 5)]),
      session("edge", "reading-quiz", new Date(NOW.getTime() - 7 * DAY_MS), [item("reading", 5)]),
    ];
    const byType = new Map(summarizeModules(sessions, NOW).map((m) => [m.type, m]));
    // 恰好 7 天前的仍在窗口内(闭区间下界),8 天前的排除
    expect(byType.get("reading-quiz")).toMatchObject({ sessions: 1, items: 1 });
  });

  it("grade 为 null 的题不计正确但不崩溃", () => {
    const sessions = [session("s", "vocab", NOW, [item("new", 5), { ...item("review", 0), grade: null }])];
    const byType = new Map(summarizeModules(sessions, NOW).map((m) => [m.type, m]));
    expect(byType.get("vocab")).toMatchObject({ sessions: 1, items: 2, correct: 1 });
  });
});
