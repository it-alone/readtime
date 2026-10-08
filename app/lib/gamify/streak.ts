import { MONTHLY_FREEZES } from "~/models/types";
import type { Streak } from "~/models/types";

// 连胜逻辑(见 ARCHITECTURE.md §6.3):
// - 本地时区判定日期;同日多次会话不重复计数
// - 每月重置 2 次"连胜保护"(freeze),漏 1 天可消耗保护维持
// - 保护不足则连胜归 1 重新开始

export function todayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDateStr(to).getTime() - parseDateStr(from).getTime()) / 86_400_000);
}

export function updateStreak(streak: Streak, now: Date): { streak: Streak; protectedByFreeze: boolean } {
  const today = todayStr(now);
  if (streak.lastActiveDate === today) {
    return { streak, protectedByFreeze: false };
  }

  let freezesLeft = streak.freezesLeft;
  let freezeResetMonth = streak.freezeResetMonth;
  if (freezeResetMonth !== monthStr(now)) {
    freezesLeft = MONTHLY_FREEZES;
    freezeResetMonth = monthStr(now);
  }

  let current: number;
  let protectedByFreeze = false;
  if (!streak.lastActiveDate) {
    current = 1;
  } else {
    const gap = daysBetween(streak.lastActiveDate, today);
    if (gap < 0) {
      // 时钟回拨(上次活跃日期在未来):保持现状,不把连胜误清零
      return { streak, protectedByFreeze: false };
    } else if (gap === 1) {
      current = streak.current + 1;
    } else if (gap >= 2 && freezesLeft > 0 && gap - 1 <= freezesLeft) {
      freezesLeft -= gap - 1;
      current = streak.current + 1;
      protectedByFreeze = true;
    } else {
      current = 1;
    }
  }

  return {
    streak: {
      current,
      longest: Math.max(streak.longest, current),
      lastActiveDate: today,
      freezesLeft,
      freezeResetMonth,
    },
    protectedByFreeze,
  };
}
