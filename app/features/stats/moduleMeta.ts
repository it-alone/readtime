import type { SessionType } from "~/models/types";

// 周报模块展示文案(周报主页 /stats 与二级页 /stats/modules 共用);
// 色相与首页模块磁贴一致,按 SessionType 取用,不依赖 moduleSummary 的输出顺序。

export const MODULE_META: Record<SessionType, { icon: string; label: string; unit: string; tone: string }> = {
  vocab: { icon: "🔤", label: "词汇", unit: "题", tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  "grammar-quiz": { icon: "📖", label: "语法", unit: "题", tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  "listening-dictation": { icon: "🎧", label: "听力", unit: "题", tone: "bg-sky-50 text-sky-600 ring-sky-100" },
  "reading-quiz": { icon: "📚", label: "阅读", unit: "题", tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  "pron-drill": { icon: "🎤", label: "发音", unit: "句", tone: "bg-rose-50 text-rose-600 ring-rose-100" },
  "spelling-drill": { icon: "✏️", label: "拼写", unit: "词", tone: "bg-teal-50 text-teal-600 ring-teal-100" },
};
