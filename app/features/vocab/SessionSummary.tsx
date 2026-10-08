import { Link } from "@remix-run/react";
import { Button } from "~/components/ui";
import type { CompletionSummary, ItemResult } from "~/models/types";

export function SessionSummary({
  summary,
  results,
  onRestart,
}: {
  summary: CompletionSummary | null;
  results: ItemResult[];
  /** 再学一组:由宿主重取任务重新开局(避免整页刷新) */
  onRestart: () => void;
}) {
  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const newCount = results.filter((r) => r.kind === "new").length;

  return (
    <div className="space-y-4 animate-fade-up">
      {/* 庆祝横幅:青玉渐变 + emoji 徽章 */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 p-6 text-center text-white shadow-lift">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <p className="relative text-5xl">🎉</p>
        <h2 className="relative mt-2 text-xl font-black tracking-tight">本组学习完成!</h2>
        {summary?.streakProtected ? (
          <p className="relative mt-1 text-xs font-medium text-emerald-50/90">🛡️ 连胜保护已生效</p>
        ) : null}
      </section>

      <div className="grid grid-cols-3 gap-2.5 text-center">
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-soft">
          <p className="bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-2xl font-black text-transparent">
            +{summary?.xpEarned ?? 0}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">经验值</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-soft">
          <p className="bg-gradient-to-b from-amber-400 to-orange-500 bg-clip-text text-2xl font-black text-transparent">
            {summary?.streak.current ?? 0}
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">连续天数 🔥</p>
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-soft">
          <p className="bg-gradient-to-b from-sky-400 to-indigo-500 bg-clip-text text-2xl font-black text-transparent">
            {accuracy}%
          </p>
          <p className="mt-1 text-xs font-medium text-slate-500">正确率</p>
        </div>
      </div>

      <p className="text-center text-sm font-medium text-slate-500">
        新词 {newCount} 个 · 复习 {total - newCount} 个
      </p>

      <div className="flex justify-center gap-3">
        <Link to="/">
          <Button variant="ghost">返回首页</Button>
        </Link>
        <Button onClick={onRestart}>再学一组</Button>
      </div>
    </div>
  );
}
