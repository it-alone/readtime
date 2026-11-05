import type { ReactNode } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { Card } from "~/components/ui";
import {
  BookOpenIcon,
  ChartIcon,
  FolderIcon,
  HeadphonesIcon,
  MicIcon,
  NewspaperIcon,
  SlidersIcon,
} from "~/components/icons";
import { getServices } from "~/lib/api/local";
import { todayStr } from "~/lib/gamify/streak";
import { earnedBadges } from "~/models/badges";
import { VOCAB_POINTER_END, type SessionType } from "~/models/types";

// 首页:今日任务台(打卡、连胜、任务入口,见 ARCHITECTURE.md §4.2)
// 视觉语言「墨蓝 · 暖金」:象牙纸底 + 深墨蓝任务主卡 + 暖金行动色,标题走衬线字;
// 模块入口为 2×2 淡彩磁贴(色相与各模块页一致),词汇是主线任务(主卡 + 进度环)。

/** 模块速通入口(词汇主线已单独展示,不重复);每个模块固定色相,全站一致 */
const MODULE_ENTRIES: {
  type: SessionType;
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode;
  label: string;
  to: string;
  disc: string;
  ink: string;
}[] = [
  {
    type: "grammar-quiz",
    icon: BookOpenIcon,
    label: "语法",
    to: "/learn/grammar",
    disc: "bg-violet-100/80",
    ink: "text-violet-600",
  },
  {
    type: "listening-dictation",
    icon: HeadphonesIcon,
    label: "听力",
    to: "/learn/listening",
    disc: "bg-sky-100/80",
    ink: "text-sky-600",
  },
  {
    type: "reading-quiz",
    icon: NewspaperIcon,
    label: "阅读",
    to: "/learn/reading",
    disc: "bg-amber-100/80",
    ink: "text-amber-600",
  },
  {
    type: "pron-drill",
    icon: MicIcon,
    label: "发音",
    to: "/learn/pron",
    disc: "bg-rose-100/80",
    ink: "text-rose-500",
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
  // 三年词库学尽后不再提供"继续学习"入口(点进去也无新词可发)
  const vocabExhausted = progress.stage === 3 && progress.vocabPointer === VOCAB_POINTER_END;
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
    vocabExhausted,
  };
}
clientLoader.hydrate = true;

const STAGE_LABEL: Record<number, string> = {
  1: "第 1 年 · 基础阶段",
  2: "第 2 年 · 进阶阶段",
  3: "第 3 年 · 高阶阶段",
};

/** 问候行:「11月5日 周四 · 晚上好」,按小时切换问候语 */
function greetLine(now: Date) {
  const h = now.getHours();
  const greet = h < 5 ? "夜深了" : h < 11 ? "早上好" : h < 13 ? "中午好" : h < 18 ? "下午好" : "晚上好";
  const weekday = "日一二三四五六"[now.getDay()];
  return `${now.getMonth() + 1}月${now.getDate()}日 周${weekday} · ${greet}`;
}

/** 主卡进度环:今日总完成度(新词 + 复习),暖金渐变描边 */
function ProgressRing({ pct, done }: { pct: number; done: boolean }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[92px] w-[92px] shrink-0">
      <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="today-ring-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="url(#today-ring-gold)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {done ? (
          <span className="text-2xl">🎉</span>
        ) : (
          <>
            <span className="font-display text-xl font-bold leading-none">
              {pct}
              <span className="text-xs font-semibold text-white/60">%</span>
            </span>
            <span className="mt-1 text-[10px] font-medium text-white/55">今日进度</span>
          </>
        )}
      </div>
    </div>
  );
}

/** 主卡内的单条进度(新词/待复习),细轨 + 暖金或月白填充 */
function HeroBar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: "gold" | "moon";
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs font-medium">
        <span className="text-white/75">{label}</span>
        <span className="tabular-nums text-white/55">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            tone === "gold" ? "bg-gradient-to-r from-amber-300 to-amber-500" : "bg-white/70"
          }`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

/** 新手引导三步(仅未学过词时展示) */
const WELCOME_STEPS: ReactNode[] = [
  <>
    定好节奏:默认每天 10 个新词,可在
    <Link to="/settings" className="mx-1 font-semibold text-amber-700 hover:underline">
      设置
    </Link>
    调整。
  </>,
  <>从上方"开始今日学习"学第一组新词,答错的词会自动安排复习。</>,
  <>
    学过几天后看
    <Link to="/stats" className="mx-1 font-semibold text-amber-700 hover:underline">
      学习周报
    </Link>
    ,系统会按你的遗忘曲线调整下周计划。
  </>,
];

export default function Index() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  const now = new Date();
  const badges = earnedBadges({
    learnedWords: data.learned,
    streakCurrent: data.streak.current,
    xp: data.xp,
  });

  // 今日总进度 = (新词已学 + 复习已清) / (今日新词目标 + 复习总量)
  const doneCount = data.goal.newDone + data.reviewsCleared;
  const totalCount = data.newTargetToday + data.reviewsCleared + data.reviewRemaining;
  const todayPct = Math.min(100, Math.round((doneCount / Math.max(totalCount, 1)) * 100));
  const newPct = (data.goal.newDone / Math.max(data.newTargetToday, 1)) * 100;
  const reviewTotal = data.reviewsCleared + data.reviewRemaining;
  const reviewPct = reviewTotal > 0 ? (data.reviewsCleared / reviewTotal) * 100 : 100;

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-lg pb-10">
      {/* 顶部氛围光:暖金晕染,衬托墨蓝主卡 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-amber-100/60 via-amber-50/30 to-transparent"
      />

      {/* 品牌行 */}
      <header className="relative flex items-center justify-between px-4 pb-1 pt-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1b2a4d] to-[#2c4370] text-amber-300 shadow-lift">
            <BookOpenIcon className="h-[22px] w-[22px]" />
          </div>
          <div>
            <h1 className="font-display text-[22px] font-bold tracking-tight text-stone-900">readTime</h1>
            <p className="text-xs font-medium text-stone-400">{STAGE_LABEL[data.stage]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span className="rounded-full bg-gradient-to-b from-amber-300 to-amber-500 px-3 py-1.5 text-[#3b2a06] shadow-[0_6px_16px_-6px_rgba(245,158,11,0.6)]">
            🔥 {data.streak.current}
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-stone-700 shadow-sm ring-1 ring-stone-900/5">
            {data.xp} XP
          </span>
        </div>
      </header>

      <div className="relative space-y-4 p-4 animate-fade-up">
        {/* 今日任务主卡:墨蓝夜读 + 暖金行动 */}
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#182643] via-[#203254] to-[#2b4370] p-5 text-white shadow-lift animate-pop-in">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-amber-400/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-12 h-48 w-48 rounded-full bg-sky-300/15 blur-3xl"
          />
          <div aria-hidden className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full border border-white/10" />
          <div aria-hidden className="pointer-events-none absolute right-6 top-2 h-56 w-56 rounded-full border border-white/[0.06]" />

          <div className="relative">
            <p className="text-[11px] font-semibold tracking-wide text-amber-200/80">{greetLine(now)}</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h2 className="font-display text-[26px] font-bold leading-none tracking-tight">今日任务</h2>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-inset ring-white/15 backdrop-blur">
                {data.remaining > 0 ? `${data.remaining} 题待完成` : "已全部完成"}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-5">
              <ProgressRing pct={todayPct} done={data.remaining === 0} />
              <div className="min-w-0 flex-1 space-y-3.5">
                <HeroBar
                  label="新词"
                  value={`${data.goal.newDone} / ${data.newTargetToday}`}
                  pct={newPct}
                  tone="gold"
                />
                <HeroBar
                  label="待复习"
                  value={data.reviewRemaining > 0 ? `${data.reviewRemaining} 个待完成` : "已清空"}
                  pct={reviewPct}
                  tone="moon"
                />
              </div>
            </div>

            {data.remaining > 0 ? (
              <Link
                to="/learn/vocab"
                className="mt-5 block rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 py-3 text-center font-bold text-[#3b2a06] shadow-[0_10px_24px_-10px_rgba(245,158,11,0.7)] ring-1 ring-inset ring-amber-200/60 transition active:scale-[0.97]"
              >
                开始今日学习({data.remaining} 题)
              </Link>
            ) : (
              <div className="mt-5 space-y-2">
                <p className="rounded-2xl bg-white/10 py-3 text-center font-bold text-amber-100 ring-1 ring-inset ring-white/10">
                  🎉 今日任务已完成,好好休息!
                </p>
                {data.vocabExhausted ? null : (
                  <Link
                    to="/learn/vocab?extra=1"
                    className="block rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 py-2.5 text-center text-sm font-bold text-[#3b2a06] shadow-[0_10px_24px_-12px_rgba(245,158,11,0.7)] transition active:scale-[0.97]"
                  >
                    意犹未尽?继续学一组新词 →
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

        {data.learned === 0 ? (
          <Card className="space-y-3 border-amber-200/50 bg-gradient-to-br from-amber-50/80 to-orange-50/40">
            <h2 className="font-bold text-stone-800">👋 欢迎开始三年英语之旅</h2>
            <p className="text-sm leading-relaxed text-stone-600">
              第 1 年基础阶段:高频词汇 + 核心语法 + 标准发音。每天 45 分钟,一年词库 10,000 词、CEFR A2。
            </p>
            <ol className="space-y-2 text-sm">
              {WELCOME_STEPS.map((text, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-400 to-amber-500 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="text-stone-700">{text}</span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] leading-relaxed text-stone-400">
              所有学习数据只保存在本机浏览器(IndexedDB),不上传任何服务器。
            </p>
          </Card>
        ) : null}

        {/* 模块速通:2×2 淡彩磁贴,完成态沿用模块色 */}
        <h2 className="px-1 pt-1 text-[13px] font-bold text-stone-500">今天练什么</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {MODULE_ENTRIES.map((m) => {
            const done = data.modulesTouched.includes(m.type);
            const Icon = m.icon;
            return (
              <Link
                key={m.type}
                to={m.to}
                title={done ? `${m.label}今日已练,再练巩固` : `今日还没练${m.label}`}
                className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-soft transition-all duration-150 hover:border-stone-300 active:scale-[0.97]"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${m.disc} ${m.ink}`}>
                  <Icon className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-stone-800">{m.label}</span>
                  <span className={`mt-0.5 block text-xs font-medium ${done ? m.ink : "text-stone-400"}`}>
                    {done ? "今日已练 ✓" : "今日未练"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>

        {/* 数据带:一体式三格,衬线大数字 */}
        <section className="flex divide-x divide-stone-200/70 rounded-3xl border border-stone-200/70 bg-white shadow-soft">
          {[
            { value: data.learned, label: "已学单词" },
            { value: data.streak.longest, label: "最长连胜" },
            { value: data.streak.freezesLeft, label: "连胜保护 🛡️" },
          ].map((c) => (
            <div key={c.label} className="flex-1 px-2 py-4 text-center">
              <p className="font-display text-[26px] font-bold leading-none tabular-nums text-stone-800">{c.value}</p>
              <p className="mt-1.5 text-xs font-medium text-stone-500">{c.label}</p>
            </div>
          ))}
        </section>

        {badges.length > 0 ? (
          <Card className="space-y-2.5">
            <h2 className="font-bold text-stone-800">已获勋章</h2>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b.id}
                  title={b.description}
                  className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700 ring-1 ring-stone-900/5"
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
            { to: "/words", icon: FolderIcon, label: "词库浏览" },
            { to: "/stats", icon: ChartIcon, label: "学习周报" },
            { to: "/settings", icon: SlidersIcon, label: "设置" },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200/80 bg-white py-2.5 text-xs font-semibold text-stone-600 shadow-sm transition hover:border-amber-300 hover:bg-amber-50/40 hover:text-amber-800 active:scale-95"
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
