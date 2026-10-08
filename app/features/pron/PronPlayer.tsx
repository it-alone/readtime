import { useEffect, useRef, useState } from "react";
import { Button, Card, ProgressBar } from "~/components/ui";
import { useServices } from "~/context/providers";
import { drillAudioUrl, speak } from "~/lib/speech";
import { isRecognitionSupported, listenOnce } from "~/lib/speech/recognition";
import { PRON_PASS_SCORE, scoreSpeech, summarizePronScore, type PronScore } from "~/lib/speech/scoring";
import type { PronDrillItem } from "~/lib/scheduler/pron";
import type { CompletionSummary } from "~/models/types";

// 发音跟读播放器:听标准音 → 跟读 → 语音识别打分(浏览器不支持时降级自评)→ 结算
// 素材两路:已学词的例句(source=vocab,带中文释义)/ 已读文章的整句(source=reading,无译文)。

type Feedback =
  | { mode: "recognize"; score: PronScore; said: string }
  | { mode: "self"; correct: boolean };

export function PronPlayer({ items, rate }: { items: PronDrillItem[]; rate: number }) {
  const services = useServices();
  const supported = useRef(isRecognitionSupported());
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"ready" | "listening" | "feedback" | "finishing">("ready");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [listenError, setListenError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<{ wordId: string; score: number; correct: boolean; elapsedMs: number }[]>([]);
  const shownAtRef = useRef(Date.now());
  const startedAtRef = useRef(new Date());
  const settledRef = useRef(false);

  const item = items[index];
  useEffect(() => {
    shownAtRef.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (phase !== "finishing" || settledRef.current) return;
    settledRef.current = true;
    services.pron
      .completeDrill(resultsRef.current, startedAtRef.current)
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "保存失败"));
  }, [phase, services]);

  function playModel(): void {
    speak(item.sentence.en, rate, drillAudioUrl(item));
  }

  async function startListening(): Promise<void> {
    setListenError(null);
    setFeedback(null);
    setPhase("listening");
    try {
      const said = await listenOnce();
      const score = scoreSpeech(item.sentence.en, said);
      resultsRef.current.push({
        wordId: item.wordId,
        score: score.overall,
        correct: score.overall >= PRON_PASS_SCORE,
        elapsedMs: Date.now() - shownAtRef.current,
      });
      setFeedback({ mode: "recognize", score, said });
      setPhase("feedback");
    } catch (e) {
      // 识别失败(权限/超时/无声音):降级为自评,不阻断训练
      setListenError(e instanceof Error ? e.message : "识别失败");
      setPhase("ready");
    }
  }

  function selfAssess(correct: boolean): void {
    resultsRef.current.push({
      wordId: item.wordId,
      score: correct ? 100 : 0,
      correct,
      elapsedMs: Date.now() - shownAtRef.current,
    });
    setFeedback({ mode: "self", correct });
    setPhase("feedback");
  }

  function next(): void {
    setFeedback(null);
    setListenError(null);
    if (index + 1 < items.length) {
      setIndex(index + 1);
      setPhase("ready");
    } else {
      setPhase("finishing");
    }
  }

  function restart(): void {
    resultsRef.current = [];
    startedAtRef.current = new Date();
    settledRef.current = false;
    setIndex(0);
    setPhase("ready");
    setFeedback(null);
    setSummary(null);
    setError(null);
  }

  if (phase === "finishing") {
    const total = resultsRef.current.length;
    const correct = resultsRef.current.filter((r) => r.correct).length;
    return (
      <>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-500 via-rose-400 to-pink-500 p-6 text-center text-white shadow-[0_16px_36px_-16px_rgba(244,63,94,0.55)] animate-pop-in">
          <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
          <div aria-hidden className="absolute -bottom-12 -left-6 h-28 w-28 rounded-full bg-white/15 blur-2xl" />
          <p className="relative text-5xl">🎉</p>
          <h2 className="relative mt-2 text-xl font-black tracking-tight">
            跟读完成 {correct} / {total} 句达标
          </h2>
          {error ? (
            <p className="relative mt-3 rounded-xl bg-rose-600/90 px-3 py-2 text-sm">保存失败:{error}</p>
          ) : summary ? (
            <div className="relative mt-3 flex justify-center gap-2 text-sm font-semibold">
              <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">+{summary.xpEarned} XP</span>
              <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">🔥 连胜 {summary.streak.current} 天</span>
            </div>
          ) : (
            <p className="relative mt-3 text-sm text-rose-50/80">正在保存学习记录…</p>
          )}
        </div>
        <Button variant="soft" className="w-full" onClick={restart}>
          再练一遍
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold tabular-nums text-slate-700">
          {index + 1}
          <span className="text-slate-300"> / {items.length}</span>
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
            supported.current
              ? "bg-rose-50 text-rose-600 ring-rose-200/60"
              : "bg-slate-50 text-slate-500 ring-slate-200/60"
          }`}
        >
          {supported.current ? "🎤 语音识别打分" : "✍️ 自评模式"}
        </span>
      </div>
      <ProgressBar value={index + (phase === "feedback" ? 1 : 0)} max={items.length} />
      <Card className="animate-pop-in space-y-4">
        <p className="text-center text-xs text-slate-400">
          {item.source === "reading" ? (
            <>
              句子来自文章 <span className="font-semibold text-slate-600">《{item.term}》</span>
            </>
          ) : (
            <>
              例句来自 <span className="font-semibold text-slate-600">{item.term}</span>
            </>
          )}
        </p>
        <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-rose-50/50 px-5 py-5 text-center ring-1 ring-slate-900/5">
          <p className="text-lg font-bold leading-8 tracking-tight text-slate-900">{item.sentence.en}</p>
          {item.sentence.zh ? <p className="mt-1.5 text-sm text-slate-400">{item.sentence.zh}</p> : null}
        </div>
        <div className="flex justify-center">
          <Button variant="ghost" onClick={playModel}>
            🔊 听标准音
          </Button>
        </div>

        {phase === "ready" ? (
          <div className="space-y-2">
            {supported.current ? (
              <Button className="w-full" onClick={() => void startListening()}>
                🎤 点击跟读
              </Button>
            ) : null}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => selfAssess(true)}>
                自评:读得流畅
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => selfAssess(false)}>
                自评:还不熟练
              </Button>
            </div>
            {listenError ? (
              <p className="text-center text-xs text-rose-500">{listenError}(可改用下方自评)</p>
            ) : null}
          </div>
        ) : phase === "listening" ? (
          <p className="animate-pulse text-center text-sm font-semibold text-rose-500">
            🎧 正在听你朗读…
          </p>
        ) : (
          <div className="space-y-3">
            {feedback?.mode === "recognize" ? (
              <RecognizeFeedback score={feedback.score} said={feedback.said} />
            ) : (
              <p className="text-center text-sm text-slate-600">
                {feedback?.mode === "self" && feedback.correct ? "👍 记录一次达标跟读" : "💪 多听几遍再来"}
              </p>
            )}
            <Button className="w-full" onClick={next}>
              {index + 1 < items.length ? "下一句" : "查看结果"}
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}

/** 识别打分反馈:总分 + 词命中摘要 + 转写对照(口径见 ARCHITECTURE.md §6.4 PronScore) */
function RecognizeFeedback({ score, said }: { score: PronScore; said: string }) {
  const { total, matched, missed } = summarizePronScore(score);
  return (
    <>
      <div className="flex items-center justify-center gap-3">
        <span
          className={`text-3xl font-black tabular-nums ${
            score.overall >= PRON_PASS_SCORE ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {score.overall}
          <span className="text-base font-bold"> 分</span>
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
          {matched}/{total} 词命中
        </span>
      </div>
      <p className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-slate-600 ring-1 ring-slate-900/5">
        你说的是:{said}
        {missed.length > 0 ? (
          <span className="mt-1 block text-xs text-amber-600">没听清:{missed.join(", ")}</span>
        ) : null}
      </p>
    </>
  );
}
