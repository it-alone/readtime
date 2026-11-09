import type { LearningSession, TaskItem, VocabTask, VocabWord } from "~/models/types";
import { shuffleSeeded } from "~/lib/random";

// 单词拼写任务(见 ARCHITECTURE.md §6.2 题型):
// 从已学词全量中随机抽 30 词出"看义拼写"题,同一轮词不重复;
// 之前拼错的词优先进入下一轮,直至拼对才退出轮换(错词集合由会话历史推导)。
// 纯粹函数:候选词与错词集合由调用方(服务层)决定,这里只负责抽取与组卷。

export const SPELLING_SESSION_SIZE = 30;

export interface SpellingTaskInput {
  /** 已学词全量(随机抽样池) */
  words: VocabWord[];
  /** 之前拼错、尚未拼对的词 id(优先入选) */
  wrongIds: string[];
  count: number;
  seed: number;
}

export function buildSpellingTask(input: SpellingTaskInput): VocabTask {
  const byId = new Map(input.words.map((w) => [w.id, w]));
  // 错词优先占坑(不在已学池里的 id 直接忽略),再从其余已学词随机补足
  const wrongPicked = shuffleSeeded(
    input.wrongIds
      .map((id) => byId.get(id))
      .filter((w): w is VocabWord => w !== undefined),
    input.seed
  ).slice(0, input.count);
  const chosen = new Set(wrongPicked.map((w) => w.id));
  const rest = shuffleSeeded(
    input.words.filter((w) => !chosen.has(w.id)),
    input.seed
  ).slice(0, Math.max(0, input.count - wrongPicked.length));
  // 错词与随机词混排:难题均匀分布,不集中在开头
  const picked = shuffleSeeded([...wrongPicked, ...rest], input.seed);
  const items: TaskItem[] = picked.map((word) => ({
    word,
    kind: "review",
    quiz: "spell",
  }));
  return {
    items,
    goal: { newTarget: 0, newDone: 0, dueCount: items.length },
  };
}

/**
 * 从拼写会话历史推导"拼错待重练"词集:每词以最近一次结果为准,
 * 拼对(grade ≥ 3,含轻微瑕疵 4)即退出,拼错则持续留在队列。
 * 入参须按 startedAt 升序(后到的会话覆盖先到的结果)。
 */
export function collectSpellingWrongIds(
  sessions: Pick<LearningSession, "type" | "items">[]
): string[] {
  const lastPassed = new Map<string, boolean>();
  for (const session of sessions) {
    if (session.type !== "spelling-drill") continue;
    for (const item of session.items) {
      lastPassed.set(item.wordId, (item.grade ?? 0) >= 3);
    }
  }
  return [...lastPassed.entries()]
    .filter(([, passed]) => !passed)
    .map(([wordId]) => wordId);
}
