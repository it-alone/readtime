import { describe, expect, it } from "vitest";
import { buildVocabTask, interleave } from "~/lib/scheduler/daily";
import type { TaskItem, VocabWord } from "~/models/types";

function mkWord(i: number): VocabWord {
  return {
    id: `w-${String(i).padStart(3, "0")}`,
    term: `word${i}`,
    phonetic: `/w${i}/`,
    meaning: `释义${i}`,
    level: "A1",
    stage: 1,
    unit: "u01",
    examples: [],
    tags: [],
  };
}

const STAGE_WORDS = Array.from({ length: 30 }, (_, i) => mkWord(i));

describe("每日任务编排", () => {
  it("复习 + 新词按目标混合,goal 字段正确", () => {
    const dueWords = [mkWord(100), mkWord(101), mkWord(102)];
    const task = buildVocabTask({
      dueWords,
      stageWords: STAGE_WORDS,
      pointerIndex: 0,
      dailyNewTarget: 10,
      newDoneToday: 0,
    });
    expect(task.items).toHaveLength(13);
    expect(task.goal.newTarget).toBe(10);
    expect(task.goal.newDone).toBe(0);
    expect(task.goal.dueCount).toBe(3);
    expect(task.items.filter((i) => i.kind === "new")).toHaveLength(10);
    expect(task.items.filter((i) => i.kind === "review")).toHaveLength(3);
  });

  it("当日已完成的新词从目标中扣除", () => {
    const task = buildVocabTask({
      dueWords: [],
      stageWords: STAGE_WORDS,
      pointerIndex: 0,
      dailyNewTarget: 10,
      newDoneToday: 6,
    });
    expect(task.items).toHaveLength(4);
    expect(task.goal.newTarget).toBe(4);
  });

  it("指针从指定位置取新词", () => {
    const task = buildVocabTask({
      dueWords: [],
      stageWords: STAGE_WORDS,
      pointerIndex: 5,
      dailyNewTarget: 3,
      newDoneToday: 0,
    });
    expect(task.items.map((i) => i.word.id)).toEqual(["w-005", "w-006", "w-007"]);
  });

  it("词库学完不再出新词", () => {
    const task = buildVocabTask({
      dueWords: [],
      stageWords: STAGE_WORDS,
      pointerIndex: 30,
      dailyNewTarget: 10,
      newDoneToday: 0,
    });
    expect(task.items).toHaveLength(0);
    expect(task.goal.newTarget).toBe(0);
  });

  it("留存率 < 0.8 时新词减半(PLAN 风险应对)", () => {
    const task = buildVocabTask({
      dueWords: [],
      stageWords: STAGE_WORDS,
      pointerIndex: 0,
      dailyNewTarget: 10,
      newDoneToday: 0,
      retentionRate: 0.7,
    });
    expect(task.goal.newTarget).toBe(5);
  });

  it("到期复习超过上限时截断为 40", () => {
    const dueWords = Array.from({ length: 60 }, (_, i) => mkWord(200 + i));
    const task = buildVocabTask({
      dueWords,
      stageWords: STAGE_WORDS,
      pointerIndex: 0,
      dailyNewTarget: 0,
      newDoneToday: 10,
    });
    expect(task.items).toHaveLength(40);
    expect(task.goal.dueCount).toBe(60); // goal 仍反映真实到期量
  });
});

describe("interleave 交错排布", () => {
  it("两队列都有剩余时不出现连续 3 个同类型", () => {
    const reviews = Array.from({ length: 12 }, (_, i) => ({ word: mkWord(i), kind: "review", quiz: "choice" } as TaskItem));
    const fresh = Array.from({ length: 8 }, (_, i) => ({ word: mkWord(50 + i), kind: "new", quiz: "choice" } as TaskItem));
    const merged = interleave(reviews, fresh);
    expect(merged).toHaveLength(20);
    for (let i = 2; i < merged.length; i++) {
      const allSame =
        merged[i].kind === merged[i - 1].kind && merged[i - 1].kind === merged[i - 2].kind;
      expect(allSame).toBe(false);
    }
  });

  it("单边为空时退化为原顺序", () => {
    const reviews = Array.from({ length: 5 }, (_, i) => ({ word: mkWord(i), kind: "review", quiz: "choice" } as TaskItem));
    expect(interleave(reviews, []).map((i) => i.word.id)).toEqual(reviews.map((i) => i.word.id));
  });
});
