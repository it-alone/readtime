import { useState } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, FilterTabs, LevelChip, PageShell, Pager, SectionHeader } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import type { ListeningItemMeta } from "~/lib/repositories/types";

// 听力训练首页:上方"今日听写"(从已学词生成),下方精听素材库
// (2000+ 篇,按年级页签 + 每页 50 篇分页,索引轻量加载)。

const PAGE_SIZE = 50;

const STAGE_META: Record<number, { eyebrow: string; title: string }> = {
  1: { eyebrow: "YEAR 1 · 起步", title: "第 1 年 · A1–A2 精听" },
  2: { eyebrow: "YEAR 2 · 进阶", title: "第 2 年 · B1 精听" },
  3: { eyebrow: "YEAR 3 · 高阶", title: "第 3 年 · 高阶精听" },
};

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const items = await getServices().listening.listItems();
  return { items };
}
clientLoader.hydrate = true;

export default function ListeningHome() {
  const data = useLoaderData<typeof clientLoader>();
  const [stage, setStage] = useState<number>(1);
  const [page, setPage] = useState(1);
  if (!data) return null;

  const stages: number[] = [...new Set(data.items.map((i) => i.stage))].sort((a, b) => a - b);
  const activeStage = stages.includes(stage) ? stage : (stages[0] ?? 1);

  const ofStage = data.items.filter((i) => i.stage === activeStage);
  const pageCount = Math.max(1, Math.ceil(ofStage.length / PAGE_SIZE));
  const pageNo = Math.min(page, pageCount);
  const visible = ofStage.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);

  const goto = (nextStage: number, nextPage: number) => {
    setStage(nextStage);
    setPage(nextPage);
    window.scrollTo({ top: 0 });
  };

  return (
    <PageShell title="听力训练" back="/">
      {/* 今日听写:听感模块用天空蓝渐变主卡,与首页模块磁贴同色相 */}
      <Link
        to="/learn/listening/dictation"
        className="relative block overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 p-5 text-white shadow-[0_12px_28px_-12px_rgba(14,165,233,0.55)] transition-transform duration-150 active:scale-[0.98]"
      >
        <div aria-hidden className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl ring-1 ring-white/25">
            🎧
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black tracking-tight">今日听写</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-sky-50/90">
              从你已学过的词生成听音选词/听写,自动播放发音,不占新词额度
            </p>
          </div>
          <span className="shrink-0 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-sky-600 shadow-sm">
            开始
          </span>
        </div>
      </Link>

      <section className="space-y-2">
        <SectionHeader eyebrow="LIBRARY · 素材库" title={`精听素材库 · ${data.items.length} 篇`} />
        <p className="px-1 text-xs leading-relaxed text-slate-400">
          每篇 = 逐句双语音频 + 理解题;先盲听再对照文本,做完题计入 XP 与连胜。
        </p>
        <FilterTabs
          tone="sky"
          value={activeStage}
          onChange={(key) => goto(key, 1)}
          tabs={stages.map((s) => ({
            key: s,
            label: `第 ${s} 年`,
            badge: data.items.filter((i) => i.stage === s).length,
          }))}
        />
        <div className="space-y-2 pt-1">
          <p className="px-1 text-sm font-bold text-slate-700">
            {STAGE_META[activeStage]?.title ?? `第 ${activeStage} 年`}
          </p>
          {visible.map((item) => (
            <ListeningCard key={item.id} item={item} />
          ))}
        </div>
        <Pager page={pageNo} pageCount={pageCount} onChange={(p) => goto(activeStage, p)} />
      </section>
    </PageShell>
  );
}

function ListeningCard({ item }: { item: ListeningItemMeta }) {
  return (
    <Link to={`/learn/listening/${item.id}`} className="block">
      <Card className="flex items-center gap-3 !p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-lg ring-1 ring-sky-100">
          {item.type === "dialogue" ? "💬" : "🎙️"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-bold text-slate-900">{item.title}</h3>
            <LevelChip level={item.level} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-slate-500">{item.summary}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {item.topic} · {item.sentenceCount} 句 · {item.questionCount} 题理解
          </p>
        </div>
        <span className="shrink-0 text-lg text-slate-300">›</span>
      </Card>
    </Link>
  );
}
