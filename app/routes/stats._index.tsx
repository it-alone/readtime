import type { ReactNode } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, PageShell, SectionHeader } from "~/components/ui";
import { MODULE_META } from "~/features/stats/moduleMeta";
import { getServices } from "~/lib/api/local";
import { todayStr } from "~/lib/gamify/streak";
import type { DailyLog } from "~/models/types";

// 学习周报主页(底栏「周报」tab,见 ARCHITECTURE.md §4.2 弱项诊断 / PLAN.md 阶段 1 Q1):
// 一屏可扫完的概览——关键数字、每日 XP 走势、下周计划建议;
// 详情拆到二级页:/stats/modules(模块训练均衡度)、/stats/memory(留存率 + 弱词榜)。

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

interface DaySeries {
  date: string;
  weekday: string;
  xp: number;
  newWords: number;
  reviews: number;
  minutes: number;
}

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [progress, logs, modules, retention, weakWords, settings, task] = await Promise.all([
    services.progress.get(),
    services.logs.getAll(),
    services.stats.moduleSummary(),
    services.vocab.recentRetention(),
    services.vocab.weakWords(10),
    services.settings.get(),
    services.vocab.getTodayTask(),
  ]);

  const byDate = new Map(logs.map((l: DailyLog) => [l.date, l]));
  const series: DaySeries[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const date = todayStr(d);
    const log = byDate.get(date);
    series.push({
      date,
      weekday: WEEKDAY_LABEL[d.getDay()],
      xp: log?.xp ?? 0,
      newWords: log?.newWordsLearned ?? 0,
      reviews: log?.reviewsDone ?? 0,
      minutes: log?.minutes ?? 0,
    });
  }

  return {
    series,
    streak: progress.streak,
    totalXp: progress.xp,
    modules,
    retention,
    weakWords,
    dailyNewWords: settings.dailyNewWords,
    dueCount: task.goal.dueCount,
  };
}
clientLoader.hydrate = true;

/** 二级页入口卡:左侧图标 + 标题/摘要,右侧大指标 + 箭头(与 Card 同视觉) */
function DetailEntry({
  to,
  icon,
  title,
  summary,
  metric,
  metricLabel,
}: {
  to: string;
  icon: string;
  title: string;
  summary: ReactNode;
  metric: ReactNode;
  metricLabel: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-3xl border border-stone-200/70 bg-white p-4 shadow-soft transition-all duration-150 hover:border-emerald-300 active:scale-[0.98]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-xl ring-1 ring-emerald-100">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-stone-800">{title}</span>
        <span className="mt-0.5 block truncate text-xs font-medium text-stone-400">{summary}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-xl font-black tabular-nums text-transparent">
          {metric}
        </span>
        <span className="mt-0.5 block text-[10px] font-medium text-stone-400">{metricLabel}</span>
      </span>
      <span className="shrink-0 self-center text-lg text-stone-300">›</span>
    </Link>
  );
}

export default function Stats() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  const totals = data.series.reduce(
    (acc, d) => ({
      xp: acc.xp + d.xp,
      newWords: acc.newWords + d.newWords,
      reviews: acc.reviews + d.reviews,
      minutes: acc.minutes + d.minutes,
    }),
    { xp: 0, newWords: 0, reviews: 0, minutes: 0 }
  );
  const activeDays = data.series.filter((d) => d.xp > 0).length;
  const maxXp = Math.max(...data.series.map((d) => d.xp), 1);
  const rate = data.retention.rate;
  const todayDate = data.series[data.series.length - 1]?.date;

  // 均衡度摘要:本周练过的模块数 / 未练模块点名(入口卡 + 建议共用)
  const unpracticedLabels = data.modules
    .filter((m) => m.type !== "vocab" && m.sessions === 0)
    .map((m) => MODULE_META[m.type].label);
  const practicedCount = data.modules.filter((m) => m.sessions > 0).length;
  const totalSessions = data.modules.reduce((acc, m) => acc + m.sessions, 0);

  // 下周计划建议:由留存率/复习积压/打卡频率推导(周报驱动下周调整,见 PLAN.md)
  const suggestions: string[] = [];
  if (rate !== undefined && rate < 0.8) {
    suggestions.push(
      `复习留存率 ${Math.round(rate * 100)}% 低于 80% 目标线:调度器已自动减半新词量,下周以巩固复习为主。`
    );
  } else {
    suggestions.push(
      `保持节奏:按每日 ${data.dailyNewWords} 个新词,下周预计新学 ${data.dailyNewWords * 7} 词。`
    );
  }
  if (data.dueCount > 40) {
    suggestions.push(`当前复习积压 ${data.dueCount} 个,建议优先清空到期复习再学新词。`);
  }
  if (activeDays < 5) {
    suggestions.push(
      `本周打卡 ${activeDays}/7 天:建议固定每日学习时段,连胜保护本月还剩 ${data.streak.freezesLeft} 次。`
    );
  }
  if (data.weakWords.length >= 5) {
    suggestions.push(
      `弱词榜已有 ${data.weakWords.length} 个高频遗忘词:每天一轮听力训练,听音拼写强化记忆。`
    );
  }
  const readingWeak = data.weakWords.filter((w) => w.source === "reading").length;
  if (readingWeak > 0) {
    suggestions.push(
      `${readingWeak} 个弱词来自阅读点词:回原文重读一遍,语境里记词效果最好。`
    );
  }
  if (unpracticedLabels.length > 0) {
    suggestions.push(
      `本周还没练过${unpracticedLabels.join("、")}:建议每天穿插一轮,均衡听说读写。`
    );
  }

  return (
    <PageShell title="学习周报">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-slate-400">近 7 天 · 每周日回顾并调整下周计划</p>
        <span className="rounded-full bg-gradient-to-b from-amber-400 to-orange-500 px-3 py-1.5 text-sm font-bold text-white shadow-[0_6px_16px_-6px_rgba(245,158,11,0.6)]">
          🔥 {data.streak.current} 天
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <Card className="!p-3">
          <p className="bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-lg font-black tabular-nums text-transparent">
            {totals.newWords}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">新词</p>
        </Card>
        <Card className="!p-3">
          <p className="bg-gradient-to-b from-sky-500 to-indigo-600 bg-clip-text text-lg font-black tabular-nums text-transparent">
            {totals.reviews}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">复习</p>
        </Card>
        <Card className="!p-3">
          <p className="bg-gradient-to-b from-violet-500 to-purple-600 bg-clip-text text-lg font-black tabular-nums text-transparent">
            {totals.xp}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">XP</p>
        </Card>
        <Card className="!p-3">
          <p className="text-lg font-black tabular-nums text-slate-900">
            {activeDays}
            <span className="text-xs font-bold text-slate-300">/7</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">活跃天</p>
        </Card>
      </div>

      <Card className="space-y-3">
        <SectionHeader eyebrow="TREND · 走势" title="每日 XP" />
        <div className="flex h-36 items-end justify-between gap-2">
          {data.series.map((d) => (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-semibold tabular-nums text-slate-400">{d.xp > 0 ? d.xp : ""}</span>
              <div
                className={`w-full rounded-t-lg transition-all ${
                  d.xp > 0
                    ? d.date === todayDate
                      ? "bg-gradient-to-t from-emerald-600 to-teal-400"
                      : "bg-gradient-to-t from-emerald-500/80 to-teal-400/70"
                    : "bg-slate-100"
                }`}
                style={{ height: `${Math.max((d.xp / maxXp) * 100, d.xp > 0 ? 6 : 3)}%` }}
                title={`${d.date} · ${d.xp} XP`}
              />
              <span
                className={`text-[10px] ${
                  d.date === todayDate ? "font-bold text-emerald-600" : "text-slate-400"
                }`}
              >
                {d.weekday}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          本周累计学习约 {totals.minutes} 分钟,平均每天 {Math.round(totals.minutes / 7)} 分钟。
        </p>
      </Card>

      {/* 详情入口:二级页承接完整明细 */}
      <DetailEntry
        to="/stats/modules"
        icon="⚖️"
        title="模块训练"
        summary={
          unpracticedLabels.length > 0
            ? `本周未练:${unpracticedLabels.join("、")}`
            : "五项均衡,听说读写全覆盖 🎉"
        }
        metric={`${practicedCount}/5`}
        metricLabel={`本周 ${totalSessions} 场`}
      />
      <DetailEntry
        to="/stats/memory"
        icon="🧠"
        title="记忆档案"
        summary={
          rate === undefined
            ? `弱词 ${data.weakWords.length} 个 · 复习样本还不足`
            : `弱词 ${data.weakWords.length} 个 · 复习正确率详情`
        }
        metric={rate === undefined ? "—" : `${Math.round(rate * 100)}%`}
        metricLabel="留存率"
      />

      <Card className="space-y-2.5">
        <SectionHeader eyebrow="NEXT WEEK · 计划" title="下周计划建议" />
        <ul className="space-y-2">
          {suggestions.map((s, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-slate-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="pb-2 text-center text-xs text-slate-400">
        数据来自本地 IndexedDB,可通过设置页导出备份。
      </p>
    </PageShell>
  );
}
