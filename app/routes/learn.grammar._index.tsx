import { useState } from "react";
import { Link, useLoaderData } from "@remix-run/react";
import { Card, FilterTabs, LevelChip, PageShell, Pager, ProgressBar, SectionHeader } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import type { GrammarLessonMeta } from "~/lib/repositories/types";

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [lessons, progress] = await Promise.all([
    services.grammar.listLessons(),
    services.progress.get(),
  ]);
  return { lessons, completed: progress.completedGrammarLessons };
}
clientLoader.hydrate = true;

// 三年课程树:每年一档页签 + 每页 50 课分页浏览(全库 3400+ 课,索引轻量加载)。
const PAGE_SIZE = 50;

const STAGE_META: Record<number, { eyebrow: string; title: string; hint: string }> = {
  1: { eyebrow: "YEAR 1 · 筑基", title: "第一年 · 基础句型", hint: "be 动词、时态入门到基本句型" },
  2: { eyebrow: "YEAR 2 · 进阶", title: "第二年 · 复杂结构", hint: "完成时、从句与非谓语" },
  3: { eyebrow: "YEAR 3 · 高阶", title: "第三年 · 长难句", hint: "虚拟语气、倒装、强调与省略" },
};

export default function GrammarList() {
  const data = useLoaderData<typeof clientLoader>();
  const [stage, setStage] = useState<number>(1);
  const [page, setPage] = useState(1);
  if (!data) return null;

  const stages: number[] = [...new Set(data.lessons.map((l) => l.stage))].sort((a, b) => a - b);
  const activeStage = stages.includes(stage) ? stage : (stages[0] ?? 1);
  const doneCount = data.lessons.filter((l) => data.completed.includes(l.id)).length;

  const ofStage = data.lessons.filter((l) => l.stage === activeStage);
  const stageDone = ofStage.filter((l) => data.completed.includes(l.id)).length;
  const pageCount = Math.max(1, Math.ceil(ofStage.length / PAGE_SIZE));
  const pageNo = Math.min(page, pageCount);
  const visible = ofStage.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);

  const goto = (nextStage: number, nextPage: number) => {
    setStage(nextStage);
    setPage(nextPage);
    window.scrollTo({ top: 0 });
  };

  const meta = STAGE_META[activeStage] ?? { eyebrow: "", title: `第 ${activeStage} 年`, hint: "" };

  return (
    <PageShell title="语法课程" back="/">
      <Card className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-black tabular-nums tracking-tight text-slate-900">
              {doneCount}
              <span className="text-base font-bold text-slate-300"> / {data.lessons.length}</span>
            </p>
            <p className="text-xs text-slate-500">已学课程 · 三年语法体系</p>
          </div>
          <span className="text-3xl">📖</span>
        </div>
        <ProgressBar value={doneCount} max={data.lessons.length} />
      </Card>

      <FilterTabs
        tone="violet"
        value={activeStage}
        onChange={(key) => goto(key, 1)}
        tabs={stages.map((s) => ({
          key: s,
          label: `第 ${s} 年`,
          badge: data.lessons.filter((l) => l.stage === s).length,
        }))}
      />

      <section className="space-y-2">
        <SectionHeader eyebrow={meta.eyebrow} title={meta.title} />
        <p className="px-1 text-xs text-slate-400">
          {meta.hint} · 已完成 {stageDone}/{ofStage.length}
        </p>
        <div className="space-y-2">
          {visible.map((lesson, i) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              index={(pageNo - 1) * PAGE_SIZE + i}
              done={data.completed.includes(lesson.id)}
            />
          ))}
        </div>
        <Pager page={pageNo} pageCount={pageCount} onChange={(p) => goto(activeStage, p)} />
      </section>
    </PageShell>
  );
}

function LessonRow({ lesson, index, done }: { lesson: GrammarLessonMeta; index: number; done: boolean }) {
  return (
    <Link to={`/learn/grammar/${lesson.id}`} className="block">
      <Card
        className={`flex items-center gap-3 !p-4 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift ${
          done ? "opacity-80" : ""
        }`}
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${
            done
              ? "bg-emerald-500 text-white shadow-[0_6px_14px_-6px_rgba(16,185,129,0.6)]"
              : "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-[0_6px_14px_-6px_rgba(139,92,246,0.55)]"
          }`}
        >
          {done ? "✓" : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-bold text-slate-900">{lesson.title}</h2>
            <LevelChip level={lesson.level} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-slate-500">{lesson.summary}</p>
          <p className="mt-1 text-[11px] text-slate-400">{lesson.questionCount} 道练习</p>
        </div>
        <span className="shrink-0 text-lg text-slate-300">›</span>
      </Card>
    </Link>
  );
}
