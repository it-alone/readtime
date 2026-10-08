import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@remix-run/react";
import { Button, Card, Chip, LevelChip, PageShell, ProgressBar, QuizOption } from "~/components/ui";
import { useServices } from "~/context/providers";
import { speak, wordAudioUrl } from "~/lib/speech";
import { tokenizeParagraph } from "~/lib/text/tokens";
import type { CompletionSummary, ReadingArticle, VocabWord } from "~/models/types";

// 阅读播放器:read(正文点词查义 + 词汇表 + 生词一键入复习)→ quiz(理解题)→ done(结算)。
// 结算走 services.reading.completeArticle:首次完成含完成奖励,重复阅读按题计分。

/** 查词面板状态:wordInfo 三态(undefined=查询中,null=词库未收录) */
type SeedStatus = "idle" | "seeding" | "seeded" | "exists" | "error";

export function ArticleReader({ article }: { article: ReadingArticle }) {
  const services = useServices();
  const [phase, setPhase] = useState<"read" | "quiz" | "done">("read");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<{ questionId: string; correct: boolean; elapsedMs: number }[]>([]);
  const startedAtRef = useRef(new Date());
  const questionShownAtRef = useRef(Date.now());
  const settledRef = useRef(false);

  // 生词标注:选中的词 + 查词结果 + 入库状态
  const [selected, setSelected] = useState<{ display: string; norm: string } | null>(null);
  const [wordInfo, setWordInfo] = useState<VocabWord | null | undefined>(undefined);
  const [seedStatus, setSeedStatus] = useState<SeedStatus>("idle");

  const question = article.questions[index];

  // 词汇表中的单词(用于文中点状下划线提示;多词词组无法逐词标注,只在词汇表展示)
  const glossaryWords = useMemo(
    () =>
      new Set(
        article.glossary
          .map((g) => g.term.toLowerCase())
          .filter((t) => !t.includes(" ")),
      ),
    [article.glossary],
  );

  useEffect(() => {
    if (phase === "quiz") questionShownAtRef.current = Date.now();
  }, [phase, index]);

  // done → 结算(会话/日志/XP;首次完成含完成奖励,重复阅读按题计分)
  useEffect(() => {
    if (phase !== "done" || settledRef.current) return;
    settledRef.current = true;
    let cancelled = false;
    services.reading
      .completeArticle(article.id, resultsRef.current, startedAtRef.current)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "保存失败");
      });
    return () => {
      cancelled = true;
    };
  }, [phase, services, article.id]);

  function startQuiz(): void {
    resultsRef.current = [];
    startedAtRef.current = new Date();
    settledRef.current = false;
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setSummary(null);
    setError(null);
    setSelected(null);
    setPhase("quiz");
  }

  function pick(i: number): void {
    if (picked !== null) return;
    setPicked(i);
    const correct = i === question.answerIndex;
    if (correct) setCorrectCount((c) => c + 1);
    resultsRef.current.push({
      questionId: question.id,
      correct,
      elapsedMs: Date.now() - questionShownAtRef.current,
    });
  }

  function next(): void {
    setPicked(null);
    if (index + 1 < article.questions.length) {
      setIndex(index + 1);
    } else {
      setPhase("done");
    }
  }

  function selectWord(display: string, norm: string): void {
    setSelected({ display, norm });
    setWordInfo(undefined);
    setSeedStatus("idle");
    void services.vocab.findByTerm(norm).then((w) => setWordInfo(w ?? null));
  }

  async function seedSelected(): Promise<void> {
    if (!wordInfo) return;
    setSeedStatus("seeding");
    try {
      const { seeded } = await services.vocab.seedReview(wordInfo.id, new Date(), article.id);
      setSeedStatus(seeded ? "seeded" : "exists");
    } catch {
      setSeedStatus("error");
    }
  }

  const glossaryHit = selected
    ? article.glossary.find((g) => g.term.toLowerCase() === selected.norm)
    : undefined;

  return (
    <PageShell title={article.title} back="/learn/reading">
      {phase === "read" ? (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <LevelChip level={article.level} />
              <Chip className="bg-amber-50 text-amber-600 ring-1 ring-amber-200/60">📚 分级阅读</Chip>
              <span className="text-[11px] text-slate-400">
                {article.topic} · 约 {article.wordCount} 词 · 点击单词查释义
              </span>
            </div>
            <div className="space-y-3.5">
              {article.paragraphs.map((p, pi) => (
                <p key={pi} className="text-[15px] leading-8 text-slate-800">
                  {tokenizeParagraph(p).map((tok, ti) =>
                    tok.word ? (
                      <button
                        key={ti}
                        type="button"
                        onClick={() => selectWord(tok.text.replace(/[^A-Za-z'-]/g, ""), tok.word!)}
                        className={`cursor-pointer rounded px-0.5 transition hover:bg-amber-100 ${
                          glossaryWords.has(tok.word) ? "underline decoration-amber-300 decoration-dotted underline-offset-4" : ""
                        } ${selected?.norm === tok.word ? "bg-amber-200 text-amber-900" : ""}`}
                      >
                        {tok.text}
                      </button>
                    ) : (
                      <span key={ti}>{tok.text}</span>
                    ),
                  )}
                </p>
              ))}
            </div>

            {selected ? (
              <div className="animate-pop-in space-y-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3.5 ring-1 ring-amber-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-slate-900">
                    {selected.display}
                    {wordInfo ? <span className="ml-2 font-normal text-sm text-slate-500">{wordInfo.phonetic}</span> : null}
                  </p>
                  {wordInfo ? (
                    <button
                      type="button"
                      aria-label="播放发音"
                      onClick={() => speak(wordInfo.term, 1, wordAudioUrl(wordInfo.id))}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 ring-1 ring-emerald-100 transition hover:bg-emerald-50 active:scale-90"
                    >
                      🔊
                    </button>
                  ) : null}
                </div>
                {wordInfo === undefined ? (
                  <p className="text-sm text-slate-400">查询中…</p>
                ) : wordInfo === null ? (
                  <p className="text-sm text-slate-700">
                    {glossaryHit ? glossaryHit.zh : "词库暂未收录这个词"}
                    {glossaryHit ? null : (
                      <span className="ml-1 text-xs text-slate-400">(阅读阶段 1 词库持续扩充中)</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-slate-700">
                    {wordInfo.meaning}
                    {glossaryHit && glossaryHit.zh !== wordInfo.meaning ? (
                      <span className="ml-1 text-xs text-slate-400">(本文:{glossaryHit.zh})</span>
                    ) : null}
                  </p>
                )}
                {wordInfo ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {seedStatus === "idle" || seedStatus === "error" ? (
                      <Button onClick={() => void seedSelected()}>
                        {seedStatus === "error" ? "重试加入复习" : "加入复习计划"}
                      </Button>
                    ) : seedStatus === "seeding" ? (
                      <span className="text-xs text-slate-400">加入中…</span>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-600">
                        ✓ {seedStatus === "seeded" ? "已加入复习计划,明天到期" : "本来就在复习计划中"}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <h2 className="mb-2.5 font-bold text-slate-900">词汇表</h2>
              <div className="grid grid-cols-2 gap-1.5 text-sm">
                {article.glossary.map((g) => (
                  <p key={g.term} className="rounded-xl bg-slate-50/80 px-2.5 py-1.5 ring-1 ring-slate-900/5">
                    <span className="font-semibold text-slate-800">{g.term}</span>
                    <span className="ml-1 text-slate-500">{g.zh}</span>
                  </p>
                ))}
              </div>
            </div>
          </Card>
          <Button className="w-full" onClick={startQuiz}>
            开始答题({article.questions.length} 题)
          </Button>
        </>
      ) : phase === "quiz" ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold tabular-nums text-slate-700">
              {index + 1}
              <span className="text-slate-300"> / {article.questions.length}</span>
            </span>
            <Chip className="bg-emerald-50 text-emerald-600">已答对 {correctCount}</Chip>
          </div>
          <ProgressBar value={index + (picked !== null ? 1 : 0)} max={article.questions.length} tone="sky" />
          <Card className="animate-pop-in space-y-4">
            <p className="rounded-2xl bg-gradient-to-br from-slate-50 to-amber-50/70 px-5 py-4 text-center text-lg font-bold leading-snug tracking-tight text-slate-900 ring-1 ring-slate-900/5">
              {question.prompt}
            </p>
            <div className="space-y-2">
              {question.options.map((opt, i) => (
                <QuizOption
                  key={`${question.id}-${i}`}
                  index={i}
                  label={opt}
                  state={
                    picked === null
                      ? "idle"
                      : i === question.answerIndex
                        ? "correct"
                        : i === picked
                          ? "wrong"
                          : "muted"
                  }
                  disabled={picked !== null}
                  onClick={() => pick(i)}
                />
              ))}
            </div>
            {picked !== null ? (
              <div className="space-y-3">
                <p className="rounded-2xl bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-800 ring-1 ring-amber-100">
                  💡 {question.explanation}
                </p>
                <Button className="w-full" onClick={next}>
                  {index + 1 < article.questions.length ? "下一题" : "查看结果"}
                </Button>
              </div>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600 p-6 text-center text-white shadow-[0_16px_36px_-16px_rgba(245,158,11,0.6)] animate-pop-in">
            <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
            <div aria-hidden className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
            <p className="relative text-5xl">🎉</p>
            <h2 className="relative mt-2 text-xl font-black tracking-tight">
              答对 {correctCount} / {article.questions.length}
            </h2>
            <p className="relative mt-1 text-sm text-amber-50/90">
              {correctCount === article.questions.length
                ? "全对!这篇文章你已经读透了。"
                : "有错题?可以回到上文再读一遍,理解后再练。"}
            </p>
            {error ? (
              <p className="relative mt-3 rounded-xl bg-rose-500/90 px-3 py-2 text-sm">保存失败:{error}</p>
            ) : summary ? (
              <div className="relative mt-3 flex justify-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">+{summary.xpEarned} XP</span>
                <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">🔥 连胜 {summary.streak.current} 天</span>
              </div>
            ) : (
              <p className="relative mt-3 text-sm text-amber-50/70">正在保存学习记录…</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link to="/learn/reading" className="flex-1">
              <Button variant="ghost" className="w-full">
                返回文章列表
              </Button>
            </Link>
            <Button variant="soft" className="flex-1" onClick={startQuiz}>
              再练一遍
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}
