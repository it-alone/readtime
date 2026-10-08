import { describe, expect, it } from "vitest";
import { daysBetween, todayStr, updateStreak } from "~/lib/gamify/streak";
import type { Streak } from "~/models/types";

function mkStreak(overrides: Partial<Streak> = {}): Streak {
  return {
    current: 0,
    longest: 0,
    lastActiveDate: "",
    freezesLeft: 2,
    freezeResetMonth: "2026-09",
    ...overrides,
  };
}

const D = (s: string) => new Date(`${s}T12:00:00`);

describe("连胜逻辑", () => {
  it("首次学习:current 1,记录日期", () => {
    const { streak, protectedByFreeze } = updateStreak(mkStreak(), D("2026-09-29"));
    expect(streak.current).toBe(1);
    expect(streak.longest).toBe(1);
    expect(streak.lastActiveDate).toBe("2026-09-29");
    expect(protectedByFreeze).toBe(false);
  });

  it("同日多次会话不重复计数", () => {
    const first = updateStreak(mkStreak(), D("2026-09-29")).streak;
    const second = updateStreak(first, new Date(2026, 8, 29, 20, 0)).streak;
    expect(second.current).toBe(1);
    expect(second).toEqual(first);
  });

  it("连续两天:current +1", () => {
    const day1 = updateStreak(mkStreak(), D("2026-09-28")).streak;
    const day2 = updateStreak(day1, D("2026-09-29")).streak;
    expect(day2.current).toBe(2);
    expect(day2.longest).toBe(2);
  });

  it("漏一天:消耗 1 次连胜保护维持连胜", () => {
    const day1 = updateStreak(mkStreak({ current: 5, longest: 5, lastActiveDate: "2026-09-27" }), D("2026-09-27")).streak;
    const day3 = updateStreak(day1, D("2026-09-29"));
    expect(day3.streak.current).toBe(6);
    expect(day3.streak.freezesLeft).toBe(1);
    expect(day3.protectedByFreeze).toBe(true);
  });

  it("漏超过保护次数:连胜归 1", () => {
    const streak = mkStreak({ current: 10, longest: 10, lastActiveDate: "2026-09-25", freezesLeft: 2 });
    // 9/25 → 9/29 漏了 3 天,只有 2 次保护
    const result = updateStreak(streak, D("2026-09-29"));
    expect(result.streak.current).toBe(1);
    expect(result.streak.longest).toBe(10);
    expect(result.protectedByFreeze).toBe(false);
  });

  it("跨月重置连胜保护额度", () => {
    const streak = mkStreak({ current: 3, longest: 3, lastActiveDate: "2026-09-30", freezesLeft: 0 });
    const result = updateStreak(streak, D("2026-10-01"));
    expect(result.streak.current).toBe(4);
    expect(result.streak.freezesLeft).toBe(2); // 10 月新一轮额度
    expect(result.streak.freezeResetMonth).toBe("2026-10");
  });

  it("时钟回拨(上次活跃日期在未来):连胜保持不变", () => {
    const streak = mkStreak({ current: 7, longest: 7, lastActiveDate: "2026-10-02" });
    const result = updateStreak(streak, D("2026-09-29"));
    expect(result.streak).toEqual(streak);
    expect(result.protectedByFreeze).toBe(false);
  });

  it("daysBetween 跨日计算", () => {
    expect(daysBetween("2026-09-28", "2026-09-29")).toBe(1);
    expect(daysBetween("2026-09-28", "2026-10-01")).toBe(3);
    expect(daysBetween("2026-09-29", "2026-09-29")).toBe(0);
  });

  it("todayStr 使用本地时区日期", () => {
    expect(todayStr(new Date(2026, 8, 29, 23, 59))).toBe("2026-09-29");
  });
});
