import { Link, useLoaderData } from "@remix-run/react";
import { Card, PageShell, SectionHeader } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import { todayStr } from "~/lib/gamify/streak";
import { speak, wordAudioUrl } from "~/lib/speech";
import type { DailyLog, SessionType } from "~/models/types";

// 学习周报(见 ARCHITECTURE.md §4.2 弱项诊断 / PLAN.md 阶段 1 Q1):
// 近 7 天 DailyLog 聚合 + 模块训练均衡度 + 复习留存率 + 弱词榜,驱动下周计划调整。

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

/** 周报模块文案(按 SessionType 取用,不依赖 moduleSummary 的输出顺序);色相与首页模块磁贴一致 */
const MODULE_META: Record<SessionType, { icon: string; label: string; unit: string; tone: string }> = {
  vocab: { icon: "🔤", label: "词汇", unit: "题", tone: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  "grammar-quiz": { icon: "📖", label: "语法", unit: "题", tone: "bg-violet-50 text-violet-600 ring-violet-100" },
  "listening-dictation": { icon: "🎧", label: "听力", unit: "题", tone: "bg-sky-50 text-sky-600 ring-sky-100" },
  "reading-quiz": { icon: "📚", label: "阅读", unit: "题", tone: "bg-amber-50 text-amber-600 ring-amber-100" },
  "pron-drill": { icon: "🎤", label: "发音", unit: "句", tone: "bg-rose-50 text-rose-600 ring-rose-100" },
};

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
  // 模块均衡度:除主线的词汇外,语法/听力/阅读/发音本周一场都没练就点名提醒
  const unpracticedLabels: string[] = [];
  data.modules.forEach((m) => {
    if (m.type !== "vocab" && m.sessions === 0) unpracticedLabels.push(MODULE_META[m.type].label);
  });
  if (unpracticedLabels.length > 0) {
    suggestions.push(
      `本周还没练过${unpracticedLabels.join("、")}:建议每天穿插一轮,均衡听说读写。`
    );
  }

  return (
    <PageShell title="学习周报" back="/">
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

      <Card className="space-y-1">
        <SectionHeader eyebrow="BALANCE · 均衡度" title="本周模块训练" />
        <ul className="divide-y divide-slate-100">
          {data.modules.map((m) => {
            const meta = MODULE_META[m.type];
            return (
              <li key={m.type} className="flex items-center justify-between gap-2 py-2.5">
                <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-800">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-xl text-sm ring-1 ${meta.tone}`}>
                    {meta.icon}
                  </span>
                  {meta.label}
                </span>
                {m.sessions === 0 ? (
                  <span className="text-xs text-slate-300">本周未练习</span>
                ) : m.accuracy === undefined ? (
                  <span className="text-xs font-medium text-slate-400">{m.sessions} 场</span>
                ) : (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">
                      {m.sessions} 场 · {m.items} {meta.unit}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 font-bold ${
                        m.accuracy >= 0.8
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {m.type === "pron-drill" ? "达标" : "正确率"} {Math.round(m.accuracy * 100)}%
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-2">
        <SectionHeader eyebrow="MEMORY · 记忆" title="复习留存率" />
        {rate === undefined ? (
          <p className="text-sm leading-relaxed text-slate-500">
            复习样本不足(当前 {data.retention.samples} 题)。完成更多复习后,这里会显示近 20 场会话的复习正确率。
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <p className="bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-3xl font-black tabular-nums text-transparent">
                {Math.round(rate * 100)}%
              </p>
              <p className="text-xs text-slate-400">基于 {data.retention.samples} 道复习题</p>
            </div>
            {rate < 0.8 ? (
              <p className="rounded-2xl bg-amber-50/80 px-4 py-2.5 text-sm leading-relaxed text-amber-700 ring-1 ring-amber-100">
                ⚠️ 正确率低于 80%,系统已自动减少每日新词量,优先巩固复习。
              </p>
            ) : (
              <p className="text-sm text-slate-500">✅ 高于 80% 目标线,保持当前节奏。</p>
            )}
          </>
        )}
      </Card>

      <Card className="space-y-1">
        <SectionHeader eyebrow="FOCUS · 弱项" title="弱词榜" />
        {data.weakWords.length === 0 ? (
          <p className="py-2 text-sm leading-relaxed text-slate-500">
            暂无弱词。学习中答错(lapse)的单词会按遗忘次数排在这里,优先安排复习。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.weakWords.map((w) => (
              <li key={w.word.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => speak(w.word.term, 1, wordAudioUrl(w.word.id))}
                      className="truncate font-bold text-slate-900 transition hover:text-emerald-600 active:scale-95"
                      title="点击发音"
                    >
                      {w.word.term} 🔊
                    </button>
                    {w.source === "reading" ? (
                      w.sourceArticleId ? (
                        <Link
                          to={`/learn/reading/${w.sourceArticleId}`}
                          className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 ring-1 ring-sky-100 transition hover:bg-sky-100"
                          title="在阅读中点词加入复习计划,点击回原文"
                        >
                          📖 回原文
                        </Link>
                      ) : (
                        <span
                          className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600 ring-1 ring-sky-100"
                          title="在阅读中点词加入复习计划"
                        >
                          📖 阅读
                        </span>
                      )
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{w.word.meaning}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs">
                  <span className="rounded-full bg-rose-50 px-2 py-1 font-bold text-rose-500">
                    遗忘 {w.lapses} 次
                  </span>
                  <span className="text-slate-400">EF {w.easeFactor.toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
