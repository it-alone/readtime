import { Link, useLoaderData } from "@remix-run/react";
import { Card, ProgressBar } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import { todayStr } from "~/lib/gamify/streak";
import { earnedBadges } from "~/models/badges";
import type { SessionType } from "~/models/types";

// 首页:今日任务台(打卡、连胜、任务入口,见 ARCHITECTURE.md §4.2)
// 词汇是主线任务(渐变主卡 + 进度),语法/听力/阅读/发音按今日 modulesTouched 显示速通状态。

/** 模块速通入口(词汇主线已单独展示,不重复);每个模块固定色相,全站一致 */
const MODULE_ENTRIES: {
  type: SessionType;
  icon: string;
  label: string;
  to: string;
  tone: string;
  doneTone: string;
}[] = [
  {
    type: "grammar-quiz",
    icon: "📖",
    label: "语法",
    to: "/learn/grammar",
    tone: "from-violet-500/90 to-purple-600/90 shadow-[0_8px_20px_-8px_rgba(139,92,246,0.5)]",
    doneTone: "from-violet-400 to-purple-500",
  },
  {
    type: "listening-dictation",
    icon: "🎧",
    label: "听力",
    to: "/learn/listening",
    tone: "from-sky-500/90 to-cyan-600/90 shadow-[0_8px_20px_-8px_rgba(14,165,233,0.5)]",
    doneTone: "from-sky-400 to-cyan-500",
  },
  {
    type: "reading-quiz",
    icon: "📚",
    label: "阅读",
    to: "/learn/reading",
    tone: "from-amber-500/90 to-orange-500/90 shadow-[0_8px_20px_-8px_rgba(245,158,11,0.5)]",
    doneTone: "from-amber-400 to-orange-400",
  },
  {
    type: "pron-drill",
    icon: "🎤",
    label: "发音",
    to: "/learn/pron",
    tone: "from-rose-500/90 to-pink-600/90 shadow-[0_8px_20px_-8px_rgba(244,63,94,0.5)]",
    doneTone: "from-rose-400 to-pink-500",
  },
];

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const now = new Date();
  const [progress, task, learned, todayLog] = await Promise.all([
    services.progress.get(),
    services.vocab.getTodayTask(now),
    services.vocab.learnedWordCount(),
    services.logs.get(todayStr(now)),
  ]);
  // 新词分母用"今日生效目标"= 已学 + 本任务剩余(留存率下调/阶段收尾时不会出现 0/10 的空进度)
  const newTargetToday = task.goal.newDone + task.goal.newTarget;
  // 待复习口径:已清 todayLog.reviewsDone + 仍到期 task 中复习项数(复习完成后 getDue 缩水,不能用 dueCount 差值)
  const reviewRemaining = task.items.filter((i) => i.kind === "review").length;
  return {
    streak: progress.streak,
    xp: progress.xp,
    stage: progress.stage,
    learned,
    goal: task.goal,
    newTargetToday,
    reviewsCleared: todayLog.reviewsDone,
    reviewRemaining,
    remaining: task.items.length,
    modulesTouched: todayLog.modulesTouched,
  };
}
clientLoader.hydrate = true;

const STAGE_LABEL: Record<number, string> = {
  1: "第 1 年 · 基础阶段",
  2: "第 2 年 · 进阶阶段",
  3: "第 3 年 · 高阶阶段",
};

export default function Index() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  const badges = earnedBadges({
    learnedWords: data.learned,
    streakCurrent: data.streak.current,
    xp: data.xp,
  });

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-lg pb-10">
      {/* 顶部氛围光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-emerald-100/80 via-teal-50/50 to-transparent"
      />

      {/* 品牌行 */}
      <header className="relative flex items-center justify-between px-4 pb-1 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xl shadow-glow">
            📖
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">readTime</h1>
            <p className="text-xs font-medium text-slate-400">{STAGE_LABEL[data.stage]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="rounded-full bg-gradient-to-b from-amber-400 to-orange-500 px-3 py-1.5 text-white shadow-[0_6px_16px_-6px_rgba(245,158,11,0.6)]">
            🔥 {data.streak.current}
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-emerald-600 shadow-sm ring-1 ring-slate-900/5">
            {data.xp} XP
          </span>
        </div>
      </header>

      <div className="relative space-y-4 p-4 animate-fade-up">
        {data.learned === 0 ? (
          <Card className="space-y-3 border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-teal-50/50">
            <h2 className="font-bold">👋 欢迎开始三年英语之旅</h2>
            <p className="text-sm leading-relaxed text-slate-600">
              第 1 年基础阶段:高频词汇 + 核心语法 + 标准发音。每天 45 分钟,一年掌握 3000 词、CEFR A2。
            </p>
            <ol className="space-y-2 text-sm">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-xs font-bold text-white">
                  1
                </span>
                <span className="text-slate-700">
                  定好节奏:默认每天 10 个新词,可在
                  <Link to="/settings" className="mx-1 font-semibold text-emerald-600 hover:underline">
                    设置
                  </Link>
                  调整。
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-xs font-bold text-white">
                  2
                </span>
                <span className="text-slate-700">从下方"开始今日学习"学第一组新词,答错的词会自动安排复习。</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-xs font-bold text-white">
                  3
                </span>
                <span className="text-slate-700">
                  学过几天后看
                  <Link to="/stats" className="mx-1 font-semibold text-emerald-600 hover:underline">
                    学习周报
                  </Link>
                  ,系统会按你的遗忘曲线调整下周计划。
                </span>
              </li>
            </ol>
            <p className="text-xs text-slate-400">所有学习数据只保存在本机浏览器(IndexedDB),不上传任何服务器。</p>
          </Card>
        ) : null}

        {/* 今日任务主卡:青玉渐变 + 白色刻度 */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-5 text-white shadow-lift animate-pop-in">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-teal-300/20 blur-2xl" />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">今日任务</h2>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur">
                {data.remaining > 0 ? `${data.remaining} 题待完成` : "已全部完成"}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 flex justify-between text-sm font-medium">
                  <span className="text-emerald-50/90">新词</span>
                  <span className="text-white/80">
                    {data.goal.newDone} / {data.newTargetToday}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (data.goal.newDone / Math.max(data.newTargetToday, 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex justify-between text-sm font-medium">
                  <span className="text-emerald-50/90">待复习</span>
                  <span className="text-white/80">
                    {data.reviewRemaining > 0 ? `${data.reviewRemaining} 个待完成` : "已清空"}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-amber-300 transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        (data.reviewsCleared / Math.max(data.reviewsCleared + data.reviewRemaining, 1)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            {data.remaining > 0 ? (
              <Link
                to="/learn/vocab"
                className="block rounded-2xl bg-white py-3 text-center font-bold text-emerald-600 shadow-md transition active:scale-[0.97]"
              >
                开始今日学习({data.remaining} 题)
              </Link>
            ) : (
              <p className="rounded-2xl bg-white/20 py-3 text-center font-bold backdrop-blur">
                🎉 今日任务已完成,好好休息!
              </p>
            )}
          </div>
        </section>

        {/* 模块速通:四色磁贴 */}
        <div className="grid grid-cols-4 gap-2.5">
          {MODULE_ENTRIES.map((m) => {
            const done = data.modulesTouched.includes(m.type);
            return (
              <Link
                key={m.type}
                to={m.to}
                title={done ? `${m.label}今日已练,再练巩固` : `今日还没练${m.label}`}
                className={`group flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-b px-1 py-3 text-xs font-bold text-white transition-all duration-150 active:scale-95 ${
                  done ? `${m.doneTone} opacity-95` : m.tone
                }`}
              >
                <span className="text-2xl transition-transform duration-150 group-active:scale-90">{m.icon}</span>
                <span>{done ? `${m.label} ✓` : m.label}</span>
              </Link>
            );
          })}
        </div>

        {/* 数据瓦片 */}
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <Card className="p-3">
            <p className="bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-2xl font-black text-transparent">
              {data.learned}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">已学单词</p>
          </Card>
          <Card className="p-3">
            <p className="bg-gradient-to-b from-amber-400 to-orange-500 bg-clip-text text-2xl font-black text-transparent">
              {data.streak.longest}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">最长连胜</p>
          </Card>
          <Card className="p-3">
            <p className="bg-gradient-to-b from-sky-400 to-indigo-500 bg-clip-text text-2xl font-black text-transparent">
              {data.streak.freezesLeft}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">连胜保护 🛡️</p>
          </Card>
        </div>

        {badges.length > 0 ? (
          <Card>
            <h2 className="mb-2.5 font-bold">已获勋章</h2>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b.id}
                  title={b.description}
                  className="rounded-full bg-slate-50 px-3 py-1.5 text-sm font-medium ring-1 ring-slate-900/5"
                >
                  {b.icon} {b.name}
                </span>
              ))}
            </div>
          </Card>
        ) : null}

        {/* 全局工具 */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { to: "/words", icon: "🗂️", label: "词库浏览" },
            { to: "/stats", icon: "📊", label: "学习周报" },
            { to: "/settings", icon: "⚙️", label: "设置" },
          ].map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="flex flex-col items-center gap-1 rounded-2xl border border-slate-200/70 bg-white py-3 text-xs font-semibold text-slate-600 shadow-soft transition hover:border-emerald-200 hover:text-emerald-700 active:scale-95"
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
