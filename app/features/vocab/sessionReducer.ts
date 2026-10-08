import { computeSessionXp } from "~/lib/gamify/xp";
import type { ItemResult, TaskItem } from "~/models/types";

// 学习会话状态机(见 ARCHITECTURE.md §4.4):
// LOADING → ACTIVE ⇄ FEEDBACK → FINISHING(持久化中)→ SUMMARY

export type SessionState =
  | { status: "loading" }
  | {
      status: "active";
      items: TaskItem[];
      index: number;
      results: ItemResult[];
      phase: "question" | "feedback";
      lastResult: ItemResult | null;
    }
  | { status: "finishing"; results: ItemResult[] }
  | { status: "summary"; results: ItemResult[]; xp: number }
  | { status: "error"; message: string };

export type SessionEvent =
  | { type: "LOADED"; items: TaskItem[] }
  | { type: "ANSWER"; result: ItemResult }
  | { type: "NEXT" }
  | { type: "FINISHED"; xp: number }
  | { type: "RESTART" }
  | { type: "ERROR"; message: string };

export const initialSessionState: SessionState = { status: "loading" };

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "LOADED":
      return {
        status: "active",
        items: event.items,
        index: 0,
        results: [],
        phase: "question",
        lastResult: null,
      };
    case "ANSWER":
      if (state.status !== "active" || state.phase !== "question") return state;
      return {
        ...state,
        results: [...state.results, event.result],
        phase: "feedback",
        lastResult: event.result,
      };
    case "NEXT": {
      if (state.status !== "active" || state.phase !== "feedback") return state;
      if (state.index + 1 < state.items.length) {
        return { ...state, index: state.index + 1, phase: "question", lastResult: null };
      }
      return { status: "finishing", results: state.results };
    }
    case "FINISHED":
      if (state.status !== "finishing") return state;
      return { status: "summary", results: state.results, xp: event.xp };
    case "ERROR":
      return { status: "error", message: event.message };
    // 再学一组:回到 loading,等调用方 revalidate 带回新任务后 LOADED 重新开局
    case "RESTART":
      return initialSessionState;
  }
}

/** 汇总用 XP(与持久化口径一致) */
export function previewSessionXp(results: ItemResult[]): number {
  return computeSessionXp(results);
}
