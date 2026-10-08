import { describe, expect, it } from "vitest";
import { createSm2Scheduler, DEFAULT_EF, MIN_EF } from "~/lib/srs/sm2";
import type { ReviewState } from "~/models/types";

const DAY = 86_400_000;
const srs = createSm2Scheduler();
const NOW = new Date("2026-09-29T10:00:00");

describe("SM-2 调度器", () => {
  it("init 生成默认状态且立即到期", () => {
    const state = srs.init("w1", NOW);
    expect(state.easeFactor).toBe(DEFAULT_EF);
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(0);
    expect(srs.isDue(state, NOW)).toBe(true);
  });

  it("连续答对:间隔序列 1 → 6 → round(prev × EF)", () => {
    let state = srs.init("w1", NOW);
    state = srs.schedule(state, 5, NOW);
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(1);
    // grade 5:EF 2.5 → 2.6
    expect(state.easeFactor).toBe(2.6);
    expect(Date.parse(state.dueDate)).toBe(NOW.getTime() + DAY);

    state = srs.schedule(state, 5, NOW);
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBe(6);
    expect(state.easeFactor).toBe(2.7);

    state = srs.schedule(state, 5, NOW);
    expect(state.repetitions).toBe(3);
    // EF 2.8:round(6 × 2.8) = 17
    expect(state.intervalDays).toBe(17);
    expect(state.easeFactor).toBe(2.8);
  });

  it("答错(<3):间隔重置为 1 天、reps 清零、lapses +1、EF 惩罚", () => {
    let state = srs.init("w1", NOW);
    state = srs.schedule(state, 5, NOW); // reps 1, EF 2.6
    state = srs.schedule(state, 5, NOW); // reps 2, EF 2.7
    const failed = srs.schedule(state, 2, NOW);
    expect(failed.repetitions).toBe(0);
    expect(failed.intervalDays).toBe(1);
    expect(failed.lapses).toBe(1);
    // grade 2:EF 2.7 + (0.1 - 3 × (0.08 + 3 × 0.02)) = 2.7 - 0.32 = 2.38
    expect(failed.easeFactor).toBe(2.38);
    expect(Date.parse(failed.dueDate)).toBe(NOW.getTime() + DAY);
  });

  it("EF 下限钳制为 1.3", () => {
    let state: ReviewState = srs.init("w1", NOW);
    for (let i = 0; i < 10; i++) {
      state = srs.schedule(state, 0, NOW);
    }
    expect(state.easeFactor).toBe(MIN_EF);
  });

  it("isDue 按到期时间判断", () => {
    let state = srs.init("w1", NOW);
    state = srs.schedule(state, 5, NOW); // 明天到期
    expect(srs.isDue(state, NOW)).toBe(false);
    expect(srs.isDue(state, new Date(NOW.getTime() + DAY + 1000))).toBe(true);
  });
});
