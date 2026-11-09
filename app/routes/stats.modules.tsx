import { useLoaderData } from "@remix-run/react";
import { Card, PageShell, SectionHeader } from "~/components/ui";
import { MODULE_META } from "~/features/stats/moduleMeta";
import { getServices } from "~/lib/api/local";

// 模块训练(周报二级页):近 7 天五大模块的会话数/题数/正确率明细,
// 每行附正确率进度条;周报主页只放概览入口卡与均衡度摘要。

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const modules = await getServices().stats.moduleSummary();
  return { modules };
}
clientLoader.hydrate = true;

export default function StatsModules() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  const practiced = data.modules.filter((m) => m.sessions > 0);
  const totalSessions = data.modules.reduce((acc, m) => acc + m.sessions, 0);
  const totalItems = data.modules.reduce((acc, m) => acc + m.items, 0);

  return (
    <PageShell title="模块训练" back="/stats">
      <Card className="space-y-1">
        <SectionHeader eyebrow="BALANCE · 均衡度" title="本周模块训练" />
        <p className="pb-1 text-xs text-slate-400">
          近 7 天 {practiced.length}/{data.modules.length} 个模块有练习,共 {totalSessions} 场 · {totalItems} 题。
        </p>
        <ul className="divide-y divide-slate-100">
          {data.modules.map((m) => {
            const meta = MODULE_META[m.type];
            return (
              <li key={m.type} className="space-y-1.5 py-2.5">
                <div className="flex items-center justify-between gap-2">
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
                          m.accuracy >= 0.8 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {m.type === "pron-drill" ? "达标" : "正确率"} {Math.round(m.accuracy * 100)}%
                      </span>
                    </div>
                  )}
                </div>
                {/* 正确率细条:正确/总数(grade>=3 与留存率同口径),无题目则不画 */}
                {m.accuracy !== undefined ? (
                  <div className="ml-[38px] h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        m.accuracy >= 0.8
                          ? "bg-gradient-to-r from-emerald-400 to-teal-500"
                          : "bg-gradient-to-r from-amber-400 to-orange-500"
                      }`}
                      style={{ width: `${Math.round(m.accuracy * 100)}%` }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        词汇是三年计划主线,语法/听力/阅读/发音建议每天穿插一轮;正确率与复习留存率同口径(grade ≥ 3 记为正确)。
      </p>
    </PageShell>
  );
}
