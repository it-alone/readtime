import { Link, useLoaderData } from "@remix-run/react";
import { Card, PageShell, SectionHeader } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import { speak, wordAudioUrl } from "~/lib/speech";

// 记忆档案(周报二级页):复习留存率详情 + 弱词榜完整列表。
// 周报主页只放概览入口卡,这里承载完整明细(点击词发音、回阅读原文)。

/** 弱词榜展示上限(按遗忘次数取最弱的前 N 个) */
const WEAK_LIMIT = 20;

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [retention, weakWords] = await Promise.all([
    services.vocab.recentRetention(),
    services.vocab.weakWords(WEAK_LIMIT),
  ]);
  return { retention, weakWords };
}
clientLoader.hydrate = true;

export default function StatsMemory() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  const rate = data.retention.rate;
  const readingWeak = data.weakWords.filter((w) => w.source === "reading").length;

  return (
    <PageShell title="记忆档案" back="/stats">
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
          <>
            <p className="pb-1 text-xs text-slate-400">
              按遗忘次数取最弱的前 {WEAK_LIMIT} 个
              {readingWeak > 0 ? ` · ${readingWeak} 个来自阅读点词(可回原文)` : ""}。
            </p>
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
          </>
        )}
      </Card>
    </PageShell>
  );
}
