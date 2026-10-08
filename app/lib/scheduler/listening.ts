import type { TaskItem, VocabTask, VocabWord } from "~/models/types";
import { shuffleSeeded } from "~/lib/random";

// 听力巩固任务(见 ARCHITECTURE.md §6.2 题型 / PLAN.md 第 1 年发音训练):
// 从已学词中按"最该复习"优先选词,生成 reverse(听音选词)/ spell(听音拼写)/ sentence(听句选义)题。
// 纯粹函数:选词排序由调用方(服务层)决定,这里只负责截取与题型分配。

export const LISTENING_SESSION_SIZE = 10;

export interface ListeningTaskInput {
  /** 已学词,按优先级降序(最该复习的在前) */
  words: VocabWord[];
  count: number;
  seed: number;
}

export function buildListeningTask(input: ListeningTaskInput): VocabTask {
  const picked = shuffleSeeded(input.words.slice(0, input.count), input.seed);
  const items: TaskItem[] = picked.map((word, i) => ({
    word,
    kind: "review",
    // 每 5 题插入 1-2 道听句选义,每 3 题保留 1 道听写,其余听音选词
    quiz: i % 5 === 2 ? "sentence" : i % 3 === 2 ? "spell" : "reverse",
  }));
  return {
    items,
    goal: { newTarget: 0, newDone: 0, dueCount: items.length },
  };
}
