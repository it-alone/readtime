import type { QuizKind, TaskItem, VocabWord } from "~/models/types";

// 每日任务编排器(纯函数,见 ARCHITECTURE.md §6.2):
// 到期复习优先、新词按剩余目标补足,交错排布避免连续 3 题同类型。

const MAX_REVIEWS_PER_SESSION = 40;

export interface BuildTaskInput {
  dueWords: VocabWord[];
  stageWords: VocabWord[];
  pointerIndex: number;
  dailyNewTarget: number;
  newDoneToday: number;
  /** 近期复习留存率(0-1);<0.8 时自动减半新词量(PLAN.md 风险应对) */
  retentionRate?: number;
}

export interface BuiltTask {
  items: TaskItem[];
  goal: { newTarget: number; newDone: number; dueCount: number };
}

export function buildVocabTask(input: BuildTaskInput): BuiltTask {
  const due = input.dueWords.slice(0, MAX_REVIEWS_PER_SESSION);
  let target = Math.max(0, input.dailyNewTarget - input.newDoneToday);
  if (input.retentionRate !== undefined && input.retentionRate < 0.8) {
    target = Math.ceil(target / 2);
  }
  const fresh = input.stageWords.slice(input.pointerIndex, input.pointerIndex + target);
  const newItems: TaskItem[] = fresh.map((word) => ({ word, kind: "new", quiz: quizFor(word, "new") }));
  const reviewItems: TaskItem[] = due.map((word) => ({ word, kind: "review", quiz: quizFor(word, "review") }));
  return {
    items: interleave(reviewItems, newItems),
    goal: { newTarget: fresh.length, newDone: input.newDoneToday, dueCount: input.dueWords.length },
  };
}

/** 交错合并(复习优先),两队列都有剩余时不出现连续 3 个同类型 */
export function interleave(reviews: TaskItem[], fresh: TaskItem[]): TaskItem[] {
  const out: TaskItem[] = [];
  let r = 0;
  let f = 0;
  const runKind = (): "new" | "review" | null => {
    const n = out.length;
    return n >= 2 && out[n - 1].kind === out[n - 2].kind ? out[n - 1].kind : null;
  };
  while (r < reviews.length || f < fresh.length) {
    const canR = r < reviews.length;
    const canF = f < fresh.length;
    const run = runKind();
    let takeReview: boolean;
    if (run === "new") {
      takeReview = canR;
    } else if (run === "review") {
      takeReview = !canF;
    } else {
      takeReview = canR && (!canF || reviews.length - r >= fresh.length - f);
    }
    if (takeReview) out.push(reviews[r++]);
    else out.push(fresh[f++]);
  }
  return out;
}

function hashString(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function quizFor(word: VocabWord, kind: "new" | "review"): QuizKind {
  const pool: QuizKind[] = kind === "new" ? ["choice", "reverse"] : ["choice", "reverse", "spell"];
  return pool[hashString(word.id) % pool.length];
}
