import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData } from "@remix-run/react";
import { Card, Chip, EmptyState, LevelChip, PageShell, SpeakButton } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import { exampleAudioUrl, speak, stop, wordAudioUrl } from "~/lib/speech";
import type { CEFR, Stage, VocabWord } from "~/models/types";

// 词库浏览:三年 10,000 词的全量只读视图(按 stage → unit 分组折叠,支持搜索与级别筛选)。
// 不写任何学习数据;词表按 stage 懒加载(manifest + ≤500KB 分片),内存缓存避免重复拉取。

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const progress = await getServices().progress.get();
  return { initialStage: progress.stage as Stage };
}
clientLoader.hydrate = true;

const STAGE_TABS: { stage: Stage; label: string }[] = [
  { stage: 1, label: "第 1 年" },
  { stage: 2, label: "第 2 年" },
  { stage: 3, label: "第 3 年" },
];

const LEVELS: CEFR[] = ["A1", "A2", "B1", "B2"];

/** 级别筛选选中态:实色底;未选中沿用 LevelChip 的浅色 */
const LEVEL_ACTIVE: Record<CEFR, string> = {
  A1: "bg-emerald-500 text-white ring-emerald-500",
  A2: "bg-sky-500 text-white ring-sky-500",
  B1: "bg-amber-500 text-white ring-amber-500",
  B2: "bg-rose-500 text-white ring-rose-500",
};

/** 搜索结果平铺上限(移动端渲染保护,提示细化关键词) */
const SEARCH_CAP = 80;

export default function WordsBrowser() {
  const data = useLoaderData<typeof clientLoader>();
  const [stage, setStage] = useState<Stage>(data?.initialStage ?? 1);
  const [words, setWords] = useState<VocabWord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<CEFR | null>(null);
  const [openUnits, setOpenUnits] = useState<Set<string>>(new Set());
  const [openWord, setOpenWord] = useState<string | null>(null);

  // stage 词表缓存:切年份即时回显
  const cacheRef = useRef(new Map<Stage, VocabWord[]>());

  useEffect(() => {
    const cached = cacheRef.current.get(stage);
    if (cached) {
      setWords(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getServices()
      .vocab.listStageWords(stage)
      .then((list) => {
        if (cancelled) return;
        cacheRef.current.set(stage, list);
        setWords(list);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // 离开页面停掉正在播放的发音
  useEffect(() => () => stop(), []);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!words) return [];
    return words.filter((w) => {
      if (level && w.level !== level) return false;
      if (!q) return true;
      return w.term.toLowerCase().includes(q) || w.meaning.toLowerCase().includes(q);
    });
  }, [words, level, q]);

  // 级别筛选可用性(当前 stage 内有该级别才显示计数)
  const levelCounts = useMemo(() => {
    const counts = new Map<CEFR, number>();
    for (const w of words ?? []) counts.set(w.level, (counts.get(w.level) ?? 0) + 1);
    return counts;
  }, [words]);

  const units = useMemo(() => {
    const byUnit = new Map<string, VocabWord[]>();
    for (const w of filtered) {
      const list = byUnit.get(w.unit) ?? [];
      list.push(w);
      byUnit.set(w.unit, list);
    }
    return [...byUnit.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const searching = q.length > 0;
  const searchHits = searching ? filtered.slice(0, SEARCH_CAP) : [];

  function toggleUnit(unit: string): void {
    setOpenUnits((prev) => {
      const next = new Set(prev);
      if (next.has(unit)) next.delete(unit);
      else next.add(unit);
      return next;
    });
  }

  return (
    <PageShell title="词库浏览" back="/">
      <p className="text-xs leading-relaxed text-slate-400">
        三年全部 10,000 词(3,000 / 3,000 / 4,000),按单元浏览,支持搜索、级别筛选与发音试听。
      </p>

      {/* 年份切换:分段控制器 */}
      <div className="flex gap-1 rounded-2xl bg-slate-100/90 p-1">
        {STAGE_TABS.map((t) => (
          <button
            key={t.stage}
            type="button"
            onClick={() => {
              setStage(t.stage);
              setOpenUnits(new Set());
              setOpenWord(null);
            }}
            className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
              stage === t.stage
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 搜索 + 级别筛选 */}
      <Card className="space-y-3 !p-3.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索单词或中文释义…"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
        />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setLevel(null)}>
            <Chip
              className={
                level === null
                  ? "bg-emerald-600 text-white ring-emerald-600"
                  : "bg-slate-100 text-slate-500 ring-slate-200/60"
              }
            >
              全部 {words?.length ?? 0}
            </Chip>
          </button>
          {LEVELS.map((lv) => (
            <button key={lv} type="button" onClick={() => setLevel(lv)}>
              {level === lv ? (
                <Chip className={`ring-1 ${LEVEL_ACTIVE[lv]}`}>
                  {lv} {levelCounts.get(lv) ?? 0}
                </Chip>
              ) : (
                <LevelChip level={lv}>{lv} {levelCounts.get(lv) ?? 0}</LevelChip>
              )}
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">词库加载中…</p>
      ) : !words ? (
        <p className="py-10 text-center text-sm text-rose-500">词库加载失败,请重试</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="没有匹配的单词" hint="换个关键词,或切换年份 / 级别再试试。" />
      ) : searching ? (
        <>
          <p className="text-xs text-slate-400">
            共 {filtered.length} 个匹配
            {filtered.length > SEARCH_CAP ? `,显示前 ${SEARCH_CAP} 个,请细化关键词` : ""}
          </p>
          <div className="space-y-1.5">
            {searchHits.map((w) => (
              <WordRow key={w.id} word={w} open={openWord === w.id} onToggle={() => setOpenWord(openWord === w.id ? null : w.id)} />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {units.map(([unit, list]) => {
            const open = openUnits.has(unit);
            return (
              <Card key={unit} className="!p-0">
                <button
                  type="button"
                  onClick={() => toggleUnit(unit)}
                  className="flex w-full items-center justify-between rounded-3xl px-4 py-3.5 text-left transition hover:bg-slate-50/60"
                >
                  <span className="flex items-center gap-2.5 font-bold text-slate-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-600">
                      {unit.replace(/^u0?/, "").padStart(2, "0")}
                    </span>
                    Unit {unit.replace(/^u0?/, "").padStart(2, "0")}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    {list.length} 词
                    <span className={`inline-block transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="space-y-1.5 border-t border-slate-100 p-3">
                    {list.map((w) => (
                      <WordRow key={w.id} word={w} open={openWord === w.id} onToggle={() => setOpenWord(openWord === w.id ? null : w.id)} />
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function WordRow({
  word,
  open,
  onToggle,
}: {
  word: VocabWord;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border transition ${
        open ? "border-emerald-300 bg-emerald-50/40 shadow-sm" : "border-slate-100 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold text-slate-900">
            {word.term}
            <span className="ml-2 font-normal text-xs text-slate-400">{word.phonetic}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{word.meaning}</p>
        </button>
        <LevelChip level={word.level} />
        <SpeakButton
          label={`播放 ${word.term}`}
          onClick={() => speak(word.term, 1, wordAudioUrl(word.id))}
          className="h-8 w-8 text-sm"
        />
      </div>
      {open ? (
        <div className="space-y-2 border-t border-emerald-100/80 px-3 py-2.5">
          {word.examples.map((ex, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
              <p className="flex-1">
                {ex.en}
                <span className="mt-0.5 block text-slate-400">{ex.zh}</span>
              </p>
              <button
                type="button"
                aria-label="播放例句"
                onClick={() => speak(ex.en, 1, exampleAudioUrl(word.id))}
                className="shrink-0 rounded-lg px-1.5 py-0.5 text-emerald-500 transition hover:bg-emerald-50 active:scale-90"
              >
                🔊
              </button>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">
            {word.stage === 1 ? "第 1 年" : word.stage === 2 ? "第 2 年" : "第 3 年"} · {word.unit}
            {word.tags.length > 0 ? ` · ${word.tags.join(" / ")}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
