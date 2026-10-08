import { useEffect, useRef, useState } from "react";
import { Link } from "@remix-run/react";
import { Button, Card, Chip, LevelChip, PageShell, ProgressBar, QuizOption } from "~/components/ui";
import { useServices } from "~/context/providers";
import type { CompletionSummary, GrammarLesson } from "~/models/types";

// 语法微课播放器:learn(知识点/例句)→ quiz(6 题练习)→ done(结算)。
// 结算走 services.grammar.completeLesson:首次完成含完成奖励,重复练习按题计分。

export function LessonPlayer({ lesson }: { lesson: GrammarLesson }) {
  const services = useServices();
  const [phase, setPhase] = useState<"learn" | "quiz" | "done">("learn");
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<{ questionId: string; correct: boolean; elapsedMs: number }[]>([]);
  const startedAtRef = useRef(new Date());
  const questionShownAtRef = useRef(Date.now());
  const settledRef = useRef(false);

  const question = lesson.questions[index];

  useEffect(() => {
    if (phase === "quiz") questionShownAtRef.current = Date.now();
  }, [phase, index]);

  // done → 结算(会话/日志/XP;首次完成含完成奖励,重复练习按题计分)
  useEffect(() => {
    if (phase !== "done" || settledRef.current) return;
    settledRef.current = true;
    let cancelled = false;
    services.grammar
      .completeLesson(lesson.id, resultsRef.current, startedAtRef.current)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "保存失败");
      });
    return () => {
      cancelled = true;
    };
  }, [phase, services, lesson.id]);

  function startQuiz(): void {
    resultsRef.current = [];
    startedAtRef.current = new Date();
    settledRef.current = false;
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setSummary(null);
    setError(null);
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
    if (index + 1 < lesson.questions.length) {
      setIndex(index + 1);
    } else {
      setPhase("done");
    }
  }

  return (
    <PageShell title={lesson.title} back="/learn/grammar">
      {phase === "learn" ? (
        <>
          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <LevelChip level={lesson.level} />
              <Chip className="bg-violet-50 text-violet-600 ring-1 ring-violet-200/60">📖 语法课</Chip>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{lesson.summary}</p>
            <div>
              <h2 className="mb-2.5 font-bold text-slate-900">知识点</h2>
              <ul className="space-y-2">
                {lesson.points.map((p, i) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="mb-2.5 font-bold text-slate-900">例句</h2>
              <div className="space-y-2">
                {lesson.examples.map((ex) => (
                  <div key={ex.en} className="rounded-2xl bg-slate-50/80 px-3.5 py-3 ring-1 ring-slate-900/5">
                    <p className="text-sm font-medium text-slate-800">{ex.en}</p>
                    <p className="mt-1 text-xs text-slate-400">{ex.zh}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Button className="w-full" onClick={startQuiz}>
            开始练习({lesson.questions.length} 题)
          </Button>
        </>
      ) : phase === "quiz" ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold tabular-nums text-slate-700">
              {index + 1}
              <span className="text-slate-300"> / {lesson.questions.length}</span>
            </span>
            <Chip className="bg-emerald-50 text-emerald-600">已答对 {correctCount}</Chip>
          </div>
          <ProgressBar value={index + (picked !== null ? 1 : 0)} max={lesson.questions.length} />
          <Card className="animate-pop-in space-y-4">
            <p className="rounded-2xl bg-gradient-to-br from-slate-50 to-violet-50/60 px-5 py-4 text-center text-lg font-bold leading-snug tracking-tight text-slate-900 ring-1 ring-slate-900/5">
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
                  {index + 1 < lesson.questions.length ? "下一题" : "查看结果"}
                </Button>
              </div>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-violet-500 to-purple-500 p-6 text-center text-white shadow-[0_16px_36px_-16px_rgba(139,92,246,0.6)] animate-pop-in">
            <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div aria-hidden className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            <p className="relative text-5xl">🎉</p>
            <h2 className="relative mt-2 text-xl font-black tracking-tight">
              答对 {correctCount} / {lesson.questions.length}
            </h2>
            <p className="relative mt-1 text-sm text-violet-50/90">
              {correctCount === lesson.questions.length
                ? "全对!这个语法点你已经掌握了。"
                : "错题会进入后续复习计划,隔几天可以再来练一遍。"}
            </p>
            {error ? (
              <p className="relative mt-3 rounded-xl bg-rose-500/90 px-3 py-2 text-sm">保存失败:{error}</p>
            ) : summary ? (
              <div className="relative mt-3 flex justify-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">+{summary.xpEarned} XP</span>
                <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">🔥 连胜 {summary.streak.current} 天</span>
              </div>
            ) : (
              <p className="relative mt-3 text-sm text-violet-50/70">正在保存学习记录…</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link to="/learn/grammar" className="flex-1">
              <Button variant="ghost" className="w-full">
                返回课程列表
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
