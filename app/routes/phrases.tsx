import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData } from "@remix-run/react";
import { Card, Chip, EmptyState, LevelChip, PageShell, SpeakButton } from "~/components/ui";
import { getServices } from "~/lib/api/local";
import { speak, stop } from "~/lib/speech";
import type { CEFR, PhraseItem, Stage } from "~/models/types";

// 短语库浏览:三年词库配套短语(每年 ~160 条)的只读视图,按 stage → 分组(动词/介词/习惯/场景)折叠。
// 短语核心词在构建时强校验 ⊆ 累积词库(build.mjs),这里直接展示;发音走系统 TTS(短语无预生成音频)。

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

export default function PhrasesBrowser() {
  const data = useLoaderData<typeof clientLoader>();
  const [stage, setStage] = useState<Stage>(data?.initialStage ?? 1);
  const [phrases, setPhrases] = useState<PhraseItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<CEFR | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openPhrase, setOpenPhrase] = useState<string | null>(null);

  // stage 短语缓存:切年份即时回显
  const cacheRef = useRef(new Map<Stage, PhraseItem[]>());

  useEffect(() => {
    const cached = cacheRef.current.get(stage);
    if (cached) {
      setPhrases(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getServices()
      .phrases.listStagePhrases(stage)
      .then((list) => {
        if (cancelled) return;
        cacheRef.current.set(stage, list);
        setPhrases(list);
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
    if (!phrases) return [];
    return phrases.filter((p) => {
      if (level && p.level !== level) return false;
      if (!q) return true;
      return p.phrase.toLowerCase().includes(q) || p.meaning.toLowerCase().includes(q);
    });
  }, [phrases, level, q]);

  // 级别筛选可用性(当前 stage 内有该级别才显示计数)
  const levelCounts = useMemo(() => {
    const counts = new Map<CEFR, number>();
    for (const p of phrases ?? []) counts.set(p.level, (counts.get(p.level) ?? 0) + 1);
    return counts;
  }, [phrases]);

  // 按分组折叠:保持 TSV 分组顺序(动词短语 → 介词短语 → 习惯表达 → 场景搭配)
  const groups = useMemo(() => {
    const byGroup = new Map<string, PhraseItem[]>();
    for (const p of filtered) {
      const list = byGroup.get(p.group) ?? [];
      list.push(p);
      byGroup.set(p.group, list);
    }
    return [...byGroup.entries()];
  }, [filtered]);

  // 分组序号:按当前学年全量短语(JSON 顺序)给分组编号
  const groupNo = useMemo(() => {
    const order = new Map<string, number>();
    for (const p of phrases ?? []) {
      if (!order.has(p.group)) order.set(p.group, order.size + 1);
    }
    return order;
  }, [phrases]);
  const groupLabelNo = (group: string) => String(groupNo.get(group) ?? "").padStart(2, "0");

  const searching = q.length > 0;
  const searchHits = searching ? filtered.slice(0, SEARCH_CAP) : [];

  function toggleGroup(group: string): void {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <PageShell
      title="短语库"
      toolbar={
        /* 年份切换:吸顶分段控制器——分组列表很长,滚到深处也能随时切学年 */
        <div className="flex gap-1 rounded-2xl bg-slate-100/90 p-1">
          {STAGE_TABS.map((t) => (
            <button
              key={t.stage}
              type="button"
              onClick={() => {
                setStage(t.stage);
                setOpenGroups(new Set());
                setOpenPhrase(null);
                // 切年后整张列表更换,回到顶部重新浏览
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-all ${
                stage === t.stage
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="text-xs leading-relaxed text-slate-400">
        三年词库配套短语(共 1,000+ 条,覆盖日常口语、职场沟通、习语谚语等高频场景,核心词均出自对应学年词库),按分组浏览,支持搜索与级别筛选。
      </p>

      {/* 搜索 + 级别筛选 */}
      <Card className="space-y-3 !p-3.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索短语或中文释义…"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
        />
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setLevel(null)}>
            <Chip
              className={
                level === null
                  ? "bg-indigo-600 text-white ring-indigo-600"
                  : "bg-slate-100 text-slate-500 ring-slate-200/60"
              }
            >
              全部 {phrases?.length ?? 0}
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
        <p className="py-10 text-center text-sm text-slate-400">短语加载中…</p>
      ) : !phrases ? (
        <p className="py-10 text-center text-sm text-rose-500">短语加载失败,请重试</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="没有匹配的短语" hint="换个关键词,或切换年份 / 级别再试试。" />
      ) : searching ? (
        <>
          <p className="text-xs text-slate-400">
            共 {filtered.length} 个匹配
            {filtered.length > SEARCH_CAP ? `,显示前 ${SEARCH_CAP} 个,请细化关键词` : ""}
          </p>
          <div className="space-y-1.5">
            {searchHits.map((p) => (
              <PhraseRow key={p.id} phrase={p} open={openPhrase === p.id} onToggle={() => setOpenPhrase(openPhrase === p.id ? null : p.id)} />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {groups.map(([group, list]) => {
            const open = openGroups.has(group);
            const no = groupLabelNo(group);
            return (
              <Card key={group} className="!p-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center justify-between rounded-3xl px-4 py-3.5 text-left transition hover:bg-slate-50/60"
                >
                  <span className="flex items-center gap-2.5 font-bold text-slate-900">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-600">
                      {no}
                    </span>
                    {group}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-400">
                    {list.length} 条
                    <span className={`inline-block transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
                      ▾
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="space-y-1.5 border-t border-slate-100 p-3">
                    {list.map((p) => (
                      <PhraseRow key={p.id} phrase={p} open={openPhrase === p.id} onToggle={() => setOpenPhrase(openPhrase === p.id ? null : p.id)} />
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

function PhraseRow({
  phrase,
  open,
  onToggle,
}: {
  phrase: PhraseItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border transition ${
        open ? "border-indigo-300 bg-indigo-50/40 shadow-sm" : "border-slate-100 bg-white"
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold text-slate-900">{phrase.phrase}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{phrase.meaning}</p>
        </button>
        <LevelChip level={phrase.level} />
        <SpeakButton
          label={`播放 ${phrase.phrase}`}
          onClick={() => speak(phrase.phrase, 1)}
          className="h-8 w-8 text-sm"
        />
      </div>
      {open ? (
        <div className="space-y-2 border-t border-indigo-100/80 px-3 py-2.5">
          <div className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            <p className="flex-1">
              {phrase.example.en}
              <span className="mt-0.5 block text-slate-400">{phrase.example.zh}</span>
            </p>
            <button
              type="button"
              aria-label="播放例句"
              onClick={() => speak(phrase.example.en, 1)}
              className="shrink-0 rounded-lg px-1.5 py-0.5 text-indigo-500 transition hover:bg-indigo-50 active:scale-90"
            >
              🔊
            </button>
          </div>
          {phrase.words.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-slate-400">核心词</span>
              {phrase.words.map((w) => (
                <span
                  key={w}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                >
                  {w}
                </span>
              ))}
            </div>
          ) : null}
          <p className="text-[11px] text-slate-400">
            {phrase.stage === 1 ? "第 1 年" : phrase.stage === 2 ? "第 2 年" : "第 3 年"} · {phrase.group}
            {phrase.tags.length > 0 ? ` · ${phrase.tags.join(" / ")}` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
