import { describe, expect, it } from "vitest";
import { computeSessionXp } from "~/lib/gamify/xp";
import { initialSessionState, previewSessionXp, sessionReducer } from "~/features/vocab/sessionReducer";
import type { ItemResult, TaskItem, VocabWord } from "~/models/types";

const word: VocabWord = {
  id: "w-1",
  term: "day",
  phonetic: "/deɪ/",
  meaning: "n. 一天",
  level: "A1",
  stage: 1,
  unit: "u01",
  examples: [],
  tags: [],
};

const items: TaskItem[] = [
  { word, kind: "new", quiz: "choice" },
  { word: { ...word, id: "w-2" }, kind: "review", quiz: "spell" },
];

const result = (wordId: string, kind: "new" | "review", correct: boolean): ItemResult => ({
  wordId,
  kind,
  grade: correct ? 5 : 2,
  correct,
  elapsedMs: 1000,
});

describe("会话状态机", () => {
  it("完整流转:LOADED → ANSWER/NEXT ×2 → finishing → summary", () => {
    let state = sessionReducer(initialSessionState, { type: "LOADED", items });
    expect(state.status).toBe("active");

    state = sessionReducer(state, { type: "ANSWER", result: result("w-1", "new", true) });
    if (state.status !== "active") throw new Error("unreachable");
    expect(state.phase).toBe("feedback");
    expect(state.results).toHaveLength(1);

    state = sessionReducer(state, { type: "NEXT" });
    if (state.status !== "active") throw new Error("unreachable");
    expect(state.index).toBe(1);
    expect(state.phase).toBe("question");

    state = sessionReducer(state, { type: "ANSWER", result: result("w-2", "review", true) });
    state = sessionReducer(state, { type: "NEXT" });
    expect(state.status).toBe("finishing");

    state = sessionReducer(state, { type: "FINISHED", xp: 35 });
    expect(state.status).toBe("summary");
    if (state.status !== "summary") throw new Error("unreachable");
    expect(state.xp).toBe(35);
    expect(state.results).toHaveLength(2);
  });

  it("RESTART 回到 loading,等待新任务 LOADED 重新开局", () => {
    let state = sessionReducer(initialSessionState, { type: "LOADED", items });
    state = sessionReducer(state, { type: "ANSWER", result: result("w-1", "new", true) });
    state = sessionReducer(state, { type: "NEXT" });
    state = sessionReducer(state, { type: "RESTART" });
    expect(state).toEqual(initialSessionState);
    state = sessionReducer(state, { type: "LOADED", items });
    expect(state.status).toBe("active");
  });

  it("非 question 阶段忽略 ANSWER", () => {
    let state = sessionReducer(initialSessionState, { type: "LOADED", items });
    state = sessionReducer(state, { type: "ANSWER", result: result("w-1", "new", true) });
    state = sessionReducer(state, { type: "ANSWER", result: result("w-2", "review", false) }); // 应被忽略
    if (state.status !== "active") throw new Error("unreachable");
    expect(state.results).toHaveLength(1);
  });

  it("XP 计算:新词 10 + 复习 5 + 会话完成 20", () => {
    const xp = computeSessionXp([result("w-1", "new", true), result("w-2", "review", true)]);
    expect(xp).toBe(35);
    expect(previewSessionXp([result("w-1", "new", true), result("w-2", "review", true)])).toBe(35);
  });

  it("新词 XP 曝光即得(ARCH §6.3),复习答错不得 XP;会话完成奖励照常", () => {
    expect(computeSessionXp([result("w-1", "new", false)])).toBe(30); // 10 新词 + 20 会话完成
    expect(computeSessionXp([result("w-1", "review", false)])).toBe(20);
    expect(computeSessionXp([])).toBe(0);
  });
});
