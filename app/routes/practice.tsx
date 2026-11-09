import type { ReactNode } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { PageShell } from "~/components/ui";
import {
  ChatIcon,
  HeadphonesIcon,
  MicIcon,
  NewspaperIcon,
  BookOpenIcon,
} from "~/components/icons";
import { getServices } from "~/lib/api/local";
import { todayStr } from "~/lib/gamify/streak";
import { VOCAB_POINTER_END, type SessionType } from "~/models/types";

// 练习中枢(底栏「练习」tab):词汇主线宽卡 + 四大模块磁贴 + 短语库入口。
// 首页只留今日任务主卡,模块导航集中在这里;完成态色相与各模块页一致。

/** 模块速通入口;每个模块固定色相,全站一致 */
const MODULE_ENTRIES: {
  type: SessionType;
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode;
  label: string;
  desc: string;
  to: string;
  disc: string;
  ink: string;
}[] = [
  {
    type: "grammar-quiz",
    icon: BookOpenIcon,
    label: "语法",
    desc: "课程 + 闯关测验",
    to: "/learn/grammar",
    disc: "bg-violet-100/80",
    ink: "text-violet-600",
  },
  {
    type: "listening-dictation",
    icon: HeadphonesIcon,
    label: "听力",
    desc: "精听 + 听写",
    to: "/learn/listening",
    disc: "bg-sky-100/80",
    ink: "text-sky-600",
  },
  {
    type: "reading-quiz",
    icon: NewspaperIcon,
    label: "阅读",
    desc: "文章 + 理解题",
    to: "/learn/reading",
    disc: "bg-amber-100/80",
    ink: "text-amber-600",
  },
  {
    type: "pron-drill",
    icon: MicIcon,
    label: "发音",
    desc: "跟读打分",
    to: "/learn/pron",
    disc: "bg-rose-100/80",
    ink: "text-rose-500",
  },
];

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const now = new Date();
  const [progress, task, todayLog] = await Promise.all([
    services.progress.get(),
    services.vocab.getTodayTask(now),
    services.logs.get(todayStr(now)),
  ]);
  return {
    remaining: task.items.length,
    // 三年词库学尽后不再提供"加学新词"入口(点进去也无新词可发)
    vocabExhausted: progress.stage === 3 && progress.vocabPointer === VOCAB_POINTER_END,
    modulesTouched: todayLog.modulesTouched,
  };
}
clientLoader.hydrate = true;

export default function Practice() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  return (
    <PageShell title="练习">
      {/* 词汇主线宽卡:词汇是三年计划的主线,置于模块之前 */}
      {data.remaining > 0 ? (
        <Link
          to="/learn/vocab"
          className="flex items-center justify-between gap-3 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 p-4 text-white shadow-[0_10px_24px_-12px_rgba(16,185,129,0.7)] transition active:scale-[0.98]"
        >
          <span>
            <span className="block text-base font-bold">词汇主线</span>
            <span className="mt-0.5 block text-xs font-medium text-white/75">
              今日还有 {data.remaining} 题待完成
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-bold ring-1 ring-inset ring-white/20">
            继续学习 →
          </span>
        </Link>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-3xl border border-emerald-200/70 bg-emerald-50/70 p-4">
          <span>
            <span className="block text-base font-bold text-emerald-800">词汇主线 · 今日已完成 🎉</span>
            <span className="mt-0.5 block text-xs font-medium text-emerald-700/70">
              {data.vocabExhausted
                ? "三年词库已学尽,按 SM-2 到期复习巩固"
                : "明天会有新的到期复习,记得回来打卡"}
            </span>
          </span>
          {data.vocabExhausted ? null : (
            <Link
              to="/learn/vocab?extra=1"
              className="shrink-0 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-sm transition active:scale-95"
            >
              加学一组 →
            </Link>
          )}
        </div>
      )}

      {/* 模块磁贴:2×2,完成态沿用模块色 */}
      <h2 className="px-1 pt-1 text-[13px] font-bold text-stone-500">四大模块</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {MODULE_ENTRIES.map((m) => {
          const done = data.modulesTouched.includes(m.type);
          const Icon = m.icon;
          return (
            <Link
              key={m.type}
              to={m.to}
              title={done ? `${m.label}今日已练,再练巩固` : `今日还没练${m.label}`}
              className="flex flex-col gap-2.5 rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-soft transition-all duration-150 hover:border-stone-300 active:scale-[0.97]"
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${m.disc} ${m.ink}`}>
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-stone-800">{m.label}</span>
                <span className={`mt-0.5 block text-xs font-medium ${done ? m.ink : "text-stone-400"}`}>
                  {done ? "今日已练 ✓" : m.desc}
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      {/* 拓展资源:短语库(三年词库配套,只读浏览) */}
      <Link
        to="/phrases"
        className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-soft transition-all duration-150 hover:border-amber-300 active:scale-[0.98]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-500">
          <ChatIcon className="h-[22px] w-[22px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-stone-800">短语库</span>
          <span className="mt-0.5 block text-xs font-medium text-stone-400">三年词库配套短语,按场景分组浏览</span>
        </span>
        <span className="shrink-0 text-stone-300">›</span>
      </Link>
    </PageShell>
  );
}
