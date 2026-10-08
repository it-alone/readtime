import type { LearningSession, SessionType } from "~/models/types";

// 模块训练汇总(周报,见 ARCHITECTURE.md §4.2 弱项诊断):
// 近 N 天各学习模块的会话数/题数/正确率。grade>=3 视为正确,与留存率同口径。
// 五个模块全部返回(没练过的为零值),供周报展示均衡度与"本周未练习"提示。

export const MODULE_TYPES: SessionType[] = [
  "vocab",
  "grammar-quiz",
  "listening-dictation",
  "reading-quiz",
  "pron-drill",
];

export interface ModuleSummary {
  type: SessionType;
  sessions: number;
  items: number;
  correct: number;
  /** 正确率;窗口内没有题时为 undefined */
  accuracy: number | undefined;
}

export function summarizeModules(
  sessions: LearningSession[],
  now: Date,
  windowDays = 7
): ModuleSummary[] {
  const cutoffMs = now.getTime() - windowDays * 86_400_000;
  const byType = new Map<SessionType, ModuleSummary>(
    MODULE_TYPES.map((type) => [
      type,
      { type, sessions: 0, items: 0, correct: 0, accuracy: undefined },
    ])
  );
  for (const session of sessions) {
    if (Date.parse(session.startedAt) < cutoffMs) continue;
    const summary = byType.get(session.type);
    if (!summary) continue;
    summary.sessions += 1;
    for (const item of session.items) {
      summary.items += 1;
      if ((item.grade ?? 0) >= 3) summary.correct += 1;
    }
  }
  for (const summary of byType.values()) {
    summary.accuracy = summary.items > 0 ? summary.correct / summary.items : undefined;
  }
  return MODULE_TYPES.map((type) => byType.get(type)!);
}
