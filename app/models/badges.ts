import type { CEFR } from "~/models/types";

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (ctx: BadgeContext) => boolean;
}

export interface BadgeContext {
  learnedWords: number;
  streakCurrent: number;
  xp: number;
  cefr?: CEFR;
}

// 勋章配置表(见 ARCHITECTURE.md §6.3)
export const BADGES: BadgeDef[] = [
  { id: "words-100", name: "初识百词", description: "累计学习 100 词", icon: "🌱", condition: (c) => c.learnedWords >= 100 },
  { id: "words-500", name: "五百精进", description: "累计学习 500 词", icon: "🌿", condition: (c) => c.learnedWords >= 500 },
  { id: "words-1000", name: "千词突破", description: "累计学习 1000 词", icon: "🌳", condition: (c) => c.learnedWords >= 1000 },
  { id: "words-3000", name: "基础毕业", description: "累计学习 3000 词(第一年目标)", icon: "⛰️", condition: (c) => c.learnedWords >= 3000 },
  { id: "words-6000", name: "进阶毕业", description: "累计学习 6000 词(第二年目标)", icon: "🏔️", condition: (c) => c.learnedWords >= 6000 },
  { id: "words-10000", name: "万词高阶", description: "累计学习 10000 词(第三年目标)", icon: "👑", condition: (c) => c.learnedWords >= 10000 },
  { id: "streak-7", name: "一周连胜", description: "连续学习 7 天", icon: "🔥", condition: (c) => c.streakCurrent >= 7 },
  { id: "streak-30", name: "月度坚持", description: "连续学习 30 天", icon: "🚀", condition: (c) => c.streakCurrent >= 30 },
  { id: "streak-100", name: "百日筑基", description: "连续学习 100 天", icon: "💎", condition: (c) => c.streakCurrent >= 100 },
  { id: "xp-1000", name: "千点经验", description: "累计获得 1000 XP", icon: "⭐", condition: (c) => c.xp >= 1000 },
];

export function earnedBadges(ctx: BadgeContext): BadgeDef[] {
  return BADGES.filter((b) => b.condition(ctx));
}
