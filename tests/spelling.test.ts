import { describe, expect, it } from "vitest";
import { buildSpellingTask, collectSpellingWrongIds, SPELLING_SESSION_SIZE } from "~/lib/scheduler/spelling";
import type { LearningSession, VocabWord } from "~/models/types";

function word(n: number): VocabWord {
  return {
    id: `w-s1-${String(n).padStart(3, "0")}`,
    term: `word${n}`,
    phonetic: "/wɜːd/",
    meaning: `n. 词${n}`,
    level: "A1",
    stage: 1,
    unit: "u01",
    examples: [{ en: `Example ${n}.`, zh: `例句${n}。` }],
    tags: ["test"],
  };
}

function spellingSession(
  startedAt: string,
  grades: { wordId: string; grade: number | null }[]
): Pick<LearningSession, "type" | "items"> {
  return {
    type: "spelling-drill",
    items: grades.map((g) => ({
      wordId: g.wordId,
      kind: "review" as const,
      grade: g.grade as LearningSession["items"][number]["grade"],
      elapsedMs: 1000,
    })),
  };
}

describe("单词拼写任务编排", () => {
  it("默认一组 30 词,从已学词全量随机抽取且同一轮不重复", () => {
    const words = Array.from({ length: 100 }, (_, i) => word(i + 1));
    const task = buildSpellingTask({ words, wrongIds: [], count: SPELLING_SESSION_SIZE, seed: 7 });
    expect(task.items).toHaveLength(30);

    const ids = task.items.map((i) => i.word.id);
    expect(new Set(ids).size).toBe(30);
    expect(ids.every((id) => words.some((w) => w.id === id))).toBe(true);
  });

  it("已学词不足 30 时全部入选,同样不重复", () => {
    const words = Array.from({ length: 12 }, (_, i) => word(i + 1));
    const task = buildSpellingTask({ words, wrongIds: [], count: SPELLING_SESSION_SIZE, seed: 7 });
    expect(task.items).toHaveLength(12);
    expect(new Set(task.items.map((i) => i.word.id)).size).toBe(12);
  });

  it("全部题目 kind=review、quiz=spell(看义拼写)", () => {
    const words = Array.from({ length: 9 }, (_, i) => word(i + 1));
    const task = buildSpellingTask({ words, wrongIds: [], count: 9, seed: 42 });
    expect(task.items.every((i) => i.kind === "review" && i.quiz === "spell")).toBe(true);
  });

  it("之前拼错的词优先入选,其余名额从剩余已学词随机补足", () => {
    const words = Array.from({ length: 50 }, (_, i) => word(i + 1));
    const wrongIds = [words[4].id, words[8].id]; // word5 / word9
    const task = buildSpellingTask({ words, wrongIds, count: 30, seed: 7 });
    const ids = task.items.map((i) => i.word.id);
    expect(ids).toContain(words[4].id);
    expect(ids).toContain(words[8].id);
    expect(new Set(ids).size).toBe(30);

    // 错词超过单轮上限时只取上限个,仍不重复
    const manyWrong = words.slice(0, 40).map((w) => w.id);
    const capped = buildSpellingTask({ words, wrongIds: manyWrong, count: 30, seed: 7 });
    expect(capped.items).toHaveLength(30);
    expect(new Set(capped.items.map((i) => i.word.id)).size).toBe(30);
  });

  it("不在已学池里的错词 id 被忽略(不产生空题)", () => {
    const words = Array.from({ length: 10 }, (_, i) => word(i + 1));
    const task = buildSpellingTask({
      words,
      wrongIds: ["w-s1-999", words[0].id],
      count: 5,
      seed: 7,
    });
    const ids = task.items.map((i) => i.word.id);
    expect(ids).toHaveLength(5);
    expect(ids).toContain(words[0].id);
    expect(ids).not.toContain("w-s1-999");
  });

  it("同 seed 结果确定,不同 seed 抽样不同(池大于单轮上限时)", () => {
    const words = Array.from({ length: 60 }, (_, i) => word(i + 1));
    const a = buildSpellingTask({ words, wrongIds: [], count: 30, seed: 1 });
    const b = buildSpellingTask({ words, wrongIds: [], count: 30, seed: 1 });
    const c = buildSpellingTask({ words, wrongIds: [], count: 30, seed: 2 });
    expect(a.items.map((i) => i.word.id)).toEqual(b.items.map((i) => i.word.id));
    expect(a.items.map((i) => i.word.id)).not.toEqual(c.items.map((i) => i.word.id));
  });

  it("goal 如实反映任务规模(无新词目标)", () => {
    const task = buildSpellingTask({ words: [word(1)], wrongIds: [], count: 30, seed: 1 });
    expect(task.goal).toEqual({ newTarget: 0, newDone: 0, dueCount: 1 });
  });
});

describe("拼写错词队列推导", () => {
  it("每词以最近一次拼写结果为准:拼错留在队列,拼对即出队", () => {
    const sessions = [
      spellingSession("2026-11-08T10:00:00.000Z", [
        { wordId: "a", grade: 2 }, // 错
        { wordId: "b", grade: 5 }, // 对
        { wordId: "c", grade: 2 }, // 错
      ]),
      spellingSession("2026-11-09T10:00:00.000Z", [
        { wordId: "a", grade: 5 }, // 雪耻:出队
        { wordId: "b", grade: 2 }, // 复错:回队
      ]),
    ];
    expect(collectSpellingWrongIds(sessions).sort()).toEqual(["b", "c"]);
  });

  it("轻微拼写瑕疵(grade 4)视作拼对出队", () => {
    const sessions = [
      spellingSession("2026-11-08T10:00:00.000Z", [{ wordId: "a", grade: 2 }]),
      spellingSession("2026-11-09T10:00:00.000Z", [{ wordId: "a", grade: 4 }]),
    ];
    expect(collectSpellingWrongIds(sessions)).toEqual([]);
  });

  it("只看拼写会话,其他模块会话不影响队列", () => {
    const sessions: Pick<LearningSession, "type" | "items">[] = [
      {
        type: "vocab",
        items: [{ wordId: "a", kind: "review", grade: 2, elapsedMs: 1000 }],
      },
    ];
    expect(collectSpellingWrongIds(sessions)).toEqual([]);
  });

  it("无拼写历史时队列为空", () => {
    expect(collectSpellingWrongIds([])).toEqual([]);
  });
});
