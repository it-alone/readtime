import { DEFAULT_SETTINGS, MONTHLY_FREEZES } from "~/models/types";
import type { DailyLog, Progress, Settings } from "~/models/types";

export function createDefaultProgress(now: Date): Progress {
  return {
    userId: "local-anonymous",
    stage: 1,
    // "" 表示新词进度指针指向词库起点
    vocabPointer: "",
    completedGrammarLessons: [],
    readArticles: [],
    assessmentHistory: [],
    streak: {
      current: 0,
      longest: 0,
      lastActiveDate: "",
      freezesLeft: MONTHLY_FREEZES,
      freezeResetMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    },
    xp: 0,
    updatedAt: now.toISOString(),
  };
}

export function createDefaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS };
}

export function createDefaultLog(date: string): DailyLog {
  return { date, newWordsLearned: 0, reviewsDone: 0, minutes: 0, xp: 0, modulesTouched: [] };
}
