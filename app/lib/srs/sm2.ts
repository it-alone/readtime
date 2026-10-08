import type { Grade, ReviewState } from "~/models/types";

// 标准 SM-2 间隔重复算法(纯函数,前后端通用,见 ARCHITECTURE.md §6.1)
// 接口化是为了阶段 3 可替换为 FSRS 等更优算法,调用方无感。

export const DEFAULT_EF = 2.5;
export const MIN_EF = 1.3;
const DAY_MS = 86_400_000;

export interface SrsScheduler {
  init(wordId: string, now: Date): ReviewState;
  schedule(state: ReviewState, grade: Grade, now: Date): ReviewState;
  isDue(state: ReviewState, now: Date): boolean;
}

function nextEaseFactor(ef: number, grade: Grade): number {
  const q = 5 - grade;
  return Math.max(MIN_EF, ef + (0.1 - q * (0.08 + q * 0.02)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function createSm2Scheduler(): SrsScheduler {
  return {
    init(wordId, now) {
      return {
        wordId,
        easeFactor: DEFAULT_EF,
        intervalDays: 0,
        repetitions: 0,
        dueDate: now.toISOString(),
        lapses: 0,
        lastReviewedAt: null,
      };
    },

    schedule(state, grade, now) {
      const easeFactor = round2(nextEaseFactor(state.easeFactor, grade));
      if (grade >= 3) {
        const repetitions = state.repetitions + 1;
        const intervalDays =
          repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(2, Math.round(state.intervalDays * easeFactor));
        return {
          ...state,
          easeFactor,
          repetitions,
          intervalDays,
          dueDate: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
          lastReviewedAt: now.toISOString(),
        };
      }
      return {
        ...state,
        easeFactor,
        repetitions: 0,
        intervalDays: 1,
        dueDate: new Date(now.getTime() + DAY_MS).toISOString(),
        lapses: state.lapses + 1,
        lastReviewedAt: now.toISOString(),
      };
    },

    isDue(state, now) {
      return Date.parse(state.dueDate) <= now.getTime();
    },
  };
}
