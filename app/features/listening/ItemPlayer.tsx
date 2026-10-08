import { useEffect, useRef, useState } from "react";
import { Link } from "@remix-run/react";
import { Button, Card, Chip, LevelChip, PageShell, ProgressBar, QuizOption } from "~/components/ui";
import { useServices } from "~/context/providers";
import { listeningSentenceAudioUrl, speak, speakAsync, stop } from "~/lib/speech";
import type { CompletionSummary, ListeningItem } from "~/models/types";

// 精听会话播放器:逐句播放(单句 🔊 / 全篇连播,可开盲听模式)+ 理解题。
// 结算走 services.listening.completeItem:记会话/日志/XP,不触碰 SM-2 与词库指针。

export function ItemPlayer({ item, rate }: { item: ListeningItem; rate: number }) {
  const services = useServices();
  const [phase, setPhase] = useState<"listen" | "quiz" | "done">("listen");
  const [showText, setShowText] = useState(true);
  const [current, setCurrent] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<{ questionId: string; correct: boolean; elapsedMs: number }[]>([]);
  const startedAtRef = useRef(new Date());
  const questionShownAtRef = useRef(Date.now());
  const settledRef = useRef(false);
  // 连播控制:token 每次开跑/停止自增,旧循环检测到即退出
  const playTokenRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const question = item.questions[index];

  useEffect(() => () => stop(), []);

  useEffect(() => {
    if (phase === "quiz") questionShownAtRef.current = Date.now();
  }, [phase, index]);

  // done → 结算(会话/日志/XP;重复精听按题计分)
  useEffect(() => {
    if (phase !== "done" || settledRef.current) return;
    settledRef.current = true;
    let cancelled = false;
    services.listening
      .completeItem(item.id, resultsRef.current, startedAtRef.current)
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "保存失败");
      });
    return () => {
      cancelled = true;
    };
  }, [phase, services, item.id]);

  function playSentence(i: number): void {
    playTokenRef.current += 1; // 打断进行中的连播
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setCurrent(i);
    const en = item.sentences[i].en;
    const url = listeningSentenceAudioUrl(item.id, i + 1);
    speak(en, rate, url);
    // 文件播放结束(或回退 TTS)后取消高亮;TTS 无法探尾,固定 6s 兜底
    window.setTimeout(() => setCurrent((c) => (c === i ? null : c)), 6000);
  }

  async function playAll(): Promise<void> {
    const token = ++playTokenRef.current;
    for (let i = 0; i < item.sentences.length; i++) {
      if (playTokenRef.current !== token) return;
      setCurrent(i);
      const ok = await playOnceAndWait(listeningSentenceAudioUrl(item.id, i + 1), rate, audioRef);
      if (playTokenRef.current !== token) return;
      // 音频缺失时回退 TTS:必须 await 逐句播完,否则下一句的播放会 cancel 掉上一句
      if (!ok) await speakAsync(item.sentences[i].en, rate);
    }
    if (playTokenRef.current === token) setCurrent(null);
  }

  function stopAll(): void {
    playTokenRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    stop();
    setCurrent(null);
  }

  function startQuiz(): void {
    stopAll();
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
    if (index + 1 < item.questions.length) {
      setIndex(index + 1);
    } else {
      setPhase("done");
    }
  }

  return (
    <PageShell title={item.title} back="/learn/listening">
      {phase === "listen" ? (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <LevelChip level={item.level} />
              <Chip className="bg-sky-50 text-sky-600 ring-1 ring-sky-200/60">
                🎧 {item.type === "dialogue" ? "对话" : "独白"}
              </Chip>
              <span className="text-[11px] text-slate-400">
                {item.topic} · {item.sentences.length} 句 · {item.questions.length} 道理解题
              </span>
            </div>
            <p className="text-sm leading-relaxed text-slate-600">{item.summary}</p>
            <div className="flex flex-wrap gap-2">
              {current === null ? (
                <Button onClick={() => void playAll()}>▶ 全篇连播</Button>
              ) : (
                <Button variant="ghost" onClick={stopAll}>
                  ⏹ 停止
                </Button>
              )}
              <Button variant="ghost" onClick={() => setShowText((v) => !v)}>
                {showText ? "🙈 切换盲听" : "👁 显示文本"}
              </Button>
            </div>
          </Card>

          <Card className="space-y-1">
            {item.sentences.map((s, i) => (
              <div
                key={i}
                className={`flex items-start gap-2.5 rounded-2xl px-2 py-2 transition ${
                  current === i ? "bg-sky-50/80 ring-1 ring-sky-200" : ""
                }`}
              >
                <button
                  type="button"
                  aria-label={`播放第 ${i + 1} 句`}
                  onClick={() => playSentence(i)}
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition active:scale-90 ${
                    current === i
                      ? "bg-sky-500 text-white shadow-[0_4px_10px_-4px_rgba(14,165,233,0.7)]"
                      : "bg-sky-50 text-sky-600 ring-1 ring-sky-100 hover:bg-sky-100"
                  }`}
                >
                  🔊
                </button>
                {showText ? (
                  <div className="min-w-0 py-0.5 text-sm leading-relaxed">
                    <p className="font-medium text-slate-800">{s.en}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{s.zh}</p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-300">第 {i + 1} 句(盲听中…)</p>
                )}
              </div>
            ))}
          </Card>
          <Button className="w-full" onClick={startQuiz}>
            开始答题({item.questions.length} 题)
          </Button>
        </>
      ) : phase === "quiz" ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold tabular-nums text-slate-700">
              {index + 1}
              <span className="text-slate-300"> / {item.questions.length}</span>
            </span>
            <Chip className="bg-emerald-50 text-emerald-600">已答对 {correctCount}</Chip>
          </div>
          <ProgressBar value={index + (picked !== null ? 1 : 0)} max={item.questions.length} tone="sky" />
          <Card className="animate-pop-in space-y-4">
            <p className="rounded-2xl bg-gradient-to-br from-slate-50 to-sky-50/70 px-5 py-4 text-center text-lg font-bold leading-snug tracking-tight text-slate-900 ring-1 ring-slate-900/5">
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
                  {index + 1 < item.questions.length ? "下一题" : "查看结果"}
                </Button>
              </div>
            ) : null}
          </Card>
        </>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-500 to-cyan-500 p-6 text-center text-white shadow-[0_16px_36px_-16px_rgba(14,165,233,0.6)] animate-pop-in">
            <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
            <div aria-hidden className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
            <p className="relative text-5xl">🎉</p>
            <h2 className="relative mt-2 text-xl font-black tracking-tight">
              答对 {correctCount} / {item.questions.length}
            </h2>
            <p className="relative mt-1 text-sm text-sky-50/90">
              {correctCount === item.questions.length
                ? "全对!这篇素材你已经听透了。"
                : "有错题?可以回到上文再听一遍,弄懂后再练。"}
            </p>
            {error ? (
              <p className="relative mt-3 rounded-xl bg-rose-500/90 px-3 py-2 text-sm">保存失败:{error}</p>
            ) : summary ? (
              <div className="relative mt-3 flex justify-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">+{summary.xpEarned} XP</span>
                <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">🔥 连胜 {summary.streak.current} 天</span>
              </div>
            ) : (
              <p className="relative mt-3 text-sm text-sky-50/70">正在保存学习记录…</p>
            )}
          </div>
          <div className="flex gap-3">
            <Link to="/learn/listening" className="flex-1">
              <Button variant="ghost" className="w-full">
                返回素材库
              </Button>
            </Link>
            <Button
              variant="soft"
              className="flex-1"
              onClick={() => {
                setPhase("listen");
                setShowText(true);
              }}
            >
              再听一遍
            </Button>
          </div>
        </>
      )}
    </PageShell>
  );
}

/** 播放一段音频到结束;返回是否成功(失败回退 TTS)。ref 供外部打断。 */
export function playOnceAndWait(
  url: string,
  rate: number,
  audioRef: { current: HTMLAudioElement | null }
): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audioRef.current = audio;
    audio.addEventListener("ended", () => resolve(true), { once: true });
    audio.addEventListener("error", () => resolve(false), { once: true });
    audio.play().catch(() => resolve(false));
  });
}
