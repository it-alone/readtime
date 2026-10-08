import { describe, expect, it } from "vitest";
import { buildListeningTask } from "~/lib/scheduler/listening";
import type { VocabWord } from "~/models/types";

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

describe("听力巩固任务编排", () => {
  it("按优先级取前 count 个词(最该复习的在前),不足则全取", () => {
    const words = Array.from({ length: 15 }, (_, i) => word(i + 1));
    const task = buildListeningTask({ words, count: 10, seed: 7 });
    expect(task.items).toHaveLength(10);

    const ids = task.items.map((i) => i.word.id);
    const source = words.slice(0, 10).map((w) => w.id);
    // 选中的是前 10 个(顺序被打乱)
    expect(new Set(ids)).toEqual(new Set(source));

    const small = buildListeningTask({ words: words.slice(0, 3), count: 10, seed: 7 });
    expect(small.items).toHaveLength(3);
  });

  it("全部题目 kind=review,题型按句级/词级混合分配", () => {
    const words = Array.from({ length: 9 }, (_, i) => word(i + 1));
    const task = buildListeningTask({ words, count: 9, seed: 42 });
    expect(task.items.every((i) => i.kind === "review")).toBe(true);
    // 位置 2/7 为听句选义,位置 5/8 为听写(听句优先,重叠位置让给听句),其余听音选词
    task.items.forEach((item, i) => {
      const expected = i % 5 === 2 ? "sentence" : i % 3 === 2 ? "spell" : "reverse";
      expect(item.quiz).toBe(expected);
    });
    expect(task.items.filter((i) => i.quiz === "sentence")).toHaveLength(2);
    expect(task.items.filter((i) => i.quiz === "spell")).toHaveLength(2);
  });

  it("同 seed 结果确定,不同 seed 题序不同", () => {
    const words = Array.from({ length: 12 }, (_, i) => word(i + 1));
    const a = buildListeningTask({ words, count: 12, seed: 1 });
    const b = buildListeningTask({ words, count: 12, seed: 1 });
    const c = buildListeningTask({ words, count: 12, seed: 2 });
    expect(a.items.map((i) => i.word.id)).toEqual(b.items.map((i) => i.word.id));
    expect(a.items.map((i) => i.word.id)).not.toEqual(c.items.map((i) => i.word.id));
  });

  it("goal 如实反映任务规模(无新词目标)", () => {
    const task = buildListeningTask({ words: [word(1)], count: 10, seed: 1 });
    expect(task.goal).toEqual({ newTarget: 0, newDone: 0, dueCount: 1 });
  });
});
