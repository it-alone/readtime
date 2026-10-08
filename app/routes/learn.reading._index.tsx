import { useState } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, FilterTabs, LevelChip, PageShell, Pager, ProgressBar, SectionHeader } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import type { ReadingArticleMeta } from "~/lib/repositories/types";

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [articles, progress] = await Promise.all([
    services.reading.listArticles(),
    services.progress.get(),
  ]);
  return { articles, read: progress.readArticles };
}
clientLoader.hydrate = true;

// 分级书架:按 CEFR 页签切片 + 每页 50 篇分页(全库 3300+ 篇,索引轻量加载)。
const PAGE_SIZE = 50;

const LEVEL_ORDER = ["A1", "A2", "B1", "B2"] as const;

const LEVEL_INTRO: Record<string, { eyebrow: string; title: string; hint: string }> = {
  A1: { eyebrow: "CEFR A1 · 入门", title: "A1 · 句句能懂", hint: "短句起步,高频词为主" },
  A2: { eyebrow: "CEFR A2 · 基础", title: "A2 · 场景短文", hint: "校园/日常场景,2–3 段" },
  B1: { eyebrow: "CEFR B1 · 进阶", title: "B1 · 场景文章", hint: "职场/旅行/媒体,叙事更完整" },
  B2: { eyebrow: "CEFR B2 · 高阶", title: "B2 · 深度长文", hint: "观点与论证,词汇面更广" },
};

export default function ReadingList() {
  const data = useLoaderData<typeof clientLoader>();
  const [level, setLevel] = useState<string>("A1");
  const [page, setPage] = useState(1);
  if (!data) return null;

  const levels = LEVEL_ORDER.filter((lv) => data.articles.some((a) => a.level === lv));
  const activeLevel = levels.includes(level as (typeof levels)[number]) ? level : (levels[0] ?? "A1");
  const doneCount = data.articles.filter((a) => data.read.includes(a.id)).length;

  const ofLevel = data.articles.filter((a) => a.level === activeLevel);
  const levelDone = ofLevel.filter((a) => data.read.includes(a.id)).length;
  const pageCount = Math.max(1, Math.ceil(ofLevel.length / PAGE_SIZE));
  const pageNo = Math.min(page, pageCount);
  const visible = ofLevel.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);

  const goto = (nextLevel: string, nextPage: number) => {
    setLevel(nextLevel);
    setPage(nextPage);
    window.scrollTo({ top: 0 });
  };

  const meta = LEVEL_INTRO[activeLevel];

  return (
    <PageShell title="阅读训练" back="/">
      <Card className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-black tabular-nums tracking-tight text-slate-900">
              {doneCount}
              <span className="text-base font-bold text-slate-300"> / {data.articles.length}</span>
            </p>
            <p className="text-xs text-slate-500">已读文章 · 8 大场景分级阅读</p>
          </div>
          <span className="text-3xl">📚</span>
        </div>
        <ProgressBar value={doneCount} max={data.articles.length} tone="sky" />
        <p className="text-xs leading-relaxed text-slate-400">
          每篇 = 分级原文 + 词汇表 + 理解题;文中点词可查释义并加入复习,读完答题计入 XP 与连胜。
        </p>
      </Card>

      <FilterTabs
        tone="amber"
        value={activeLevel}
        onChange={(key) => goto(key, 1)}
        tabs={levels.map((lv) => ({
          key: lv as string,
          label: lv,
          badge: data.articles.filter((a) => a.level === lv).length,
        }))}
      />

      <section className="space-y-2">
        <SectionHeader eyebrow={meta.eyebrow} title={meta.title} />
        <p className="px-1 text-xs text-slate-400">
          {meta.hint} · 已读 {levelDone}/{ofLevel.length}
        </p>
        <div className="space-y-2">
          {visible.map((article) => (
            <ArticleRow key={article.id} article={article} done={data.read.includes(article.id)} />
          ))}
        </div>
        <Pager page={pageNo} pageCount={pageCount} onChange={(p) => goto(activeLevel, p)} />
      </section>
    </PageShell>
  );
}

function ArticleRow({ article, done }: { article: ReadingArticleMeta; done: boolean }) {
  return (
    <Link to={`/learn/reading/${article.id}`} className="block">
      <Card
        className={`flex items-center gap-3 !p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift ${
          done ? "opacity-80" : ""
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm ${
            done
              ? "bg-emerald-500 text-white shadow-[0_6px_14px_-6px_rgba(16,185,129,0.6)]"
              : "bg-amber-50 text-lg text-amber-500 ring-1 ring-amber-100"
          }`}
        >
          {done ? "✓" : "📄"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-bold text-slate-900">{article.title}</h2>
            <LevelChip level={article.level} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-slate-500">{article.summary}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            {article.topic} · 约 {article.wordCount} 词 · {article.questionCount} 道理解题
          </p>
        </div>
        <span className="shrink-0 text-lg text-slate-300">›</span>
      </Card>
    </Link>
  );
}
