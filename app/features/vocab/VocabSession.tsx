import { useEffect, useReducer, useRef, useState } from "react";
import { Link, useRevalidator } from "@remix-run/react";
import { Button, Card, ProgressBar } from "~/components/ui";
import { useServices } from "~/context/providers";
import { speak, wordAudioUrl } from "~/lib/speech";
import type { CompletionSummary, ItemResult, VocabTask, VocabWord } from "~/models/types";
import { QuizCard } from "./QuizCard";
import { SessionSummary } from "./SessionSummary";
import { initialSessionState, sessionReducer } from "./sessionReducer";

// 学习会话编排:clientLoader 取任务 → 状态机推进 → finishing 时原子持久化 → 结算
// 词汇模式走 SM-2 + 指针推进;听力模式(audio)传 complete 回调走补充结算

export function VocabSession({
  task,
  distractors,
  audio = false,
  rate = 1,
  complete,
}: {
  task: VocabTask;
  distractors: VocabWord[];
  /** 听力模式:提示改为播放发音并自动播放 */
  audio?: boolean;
  /** 发音语速(来自设置 audioRate) */
  rate?: number;
  /** 会话完成回调;缺省为词汇学习结算(SM-2 + 指针推进) */
  complete?: (results: ItemResult[], startedAt: Date) => Promise<CompletionSummary>;
}) {
  const services = useServices();
  const revalidator = useRevalidator();
  const startedAt = useRef(new Date());
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [summary, setSummary] = useState<CompletionSummary | null>(null);

  useEffect(() => {
    dispatch({ type: "LOADED", items: task.items });
  }, [task]);

  // finishing → 原子持久化(见 ARCHITECTURE.md §7.3)→ 结算
  const finishingResults = state.status === "finishing" ? state.results : null;
  useEffect(() => {
    if (!finishingResults) return;
    let cancelled = false;
    const finish = complete ?? ((r, s) => services.vocab.completeSession(r, s));
    finish(finishingResults, startedAt.current)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        dispatch({ type: "FINISHED", xp: s.xpEarned });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        dispatch({ type: "ERROR", message: e instanceof Error ? e.message : "保存失败" });
      });
    return () => {
      cancelled = true;
    };
  }, [finishingResults, services, complete]);

  // feedback 阶段回车进入下一题
  const feedbackActive = state.status === "active" && state.phase === "feedback";
  useEffect(() => {
    if (!feedbackActive) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Enter") dispatch({ type: "NEXT" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [feedbackActive]);

  // 再学一组:重置状态机 + revalidate 重跑路由 clientLoader 取新任务(不整页刷新)
  function restart(): void {
    setSummary(null);
    startedAt.current = new Date();
    dispatch({ type: "RESTART" });
    revalidator.revalidate();
  }

  if (state.status === "loading") {
    return <p className="text-center text-sm text-slate-500">正在生成学习任务…</p>;
  }

  if (state.status === "error") {
    return (
      <Card className="space-y-3 text-center">
        <p className="text-4xl">😵</p>
        <p className="text-sm text-slate-600">保存失败:{state.message}</p>
        <Link to="/" className="inline-block text-sm text-emerald-600 underline">
          返回首页
        </Link>
      </Card>
    );
  }

  if (state.status === "summary") {
    return <SessionSummary summary={summary} results={state.results} onRestart={restart} />;
  }

  if (state.status === "finishing") {
    return <p className="text-center text-sm text-slate-500">正在保存学习记录…</p>;
  }

  const { items, index, phase, lastResult } = state;
  const item = items[index];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          aria-label="退出学习"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-400 shadow-sm ring-1 ring-slate-900/5 transition hover:text-slate-700 active:scale-90"
        >
          ✕
        </Link>
        <div className="flex-1">
          <ProgressBar value={index + (phase === "feedback" ? 1 : 0)} max={items.length} />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-slate-500">
          {index + 1}
          <span className="font-medium text-slate-300"> / {items.length}</span>
        </span>
      </div>

      <Card className="animate-pop-in">
        <QuizCard
          key={item.word.id + index}
          item={item}
          pool={distractors}
          onAnswer={(result) => dispatch({ type: "ANSWER", result })}
          audio={audio}
          rate={rate}
        />
      </Card>

      {phase === "feedback" && lastResult ? (
        <FeedbackPanel item={item} result={lastResult} onNext={() => dispatch({ type: "NEXT" })} />
      ) : null}
    </div>
  );
}

function FeedbackPanel({
  item,
  result,
  onNext,
}: {
  item: { word: VocabWord };
  result: ItemResult;
  onNext: () => void;
}) {
  const { word } = item;
  return (
    <Card className="space-y-4 animate-pop-in">
      <div
        className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold ${
          result.correct
            ? "bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 ring-1 ring-emerald-200/70"
            : "bg-gradient-to-r from-rose-50 to-orange-50 text-rose-700 ring-1 ring-rose-200/70"
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white ${
            result.correct ? "bg-emerald-500" : "bg-rose-500"
          }`}
        >
          {result.correct ? "✓" : "✕"}
        </span>
        {result.correct ? "正确!" : `应为 ${word.term}`}
        {result.correct && result.grade === 4 ? (
          <span className="font-medium text-emerald-600/80">(拼写有小瑕疵,已通过)</span>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={() => speak(word.term, 1, wordAudioUrl(word.id))}
            className="text-2xl font-black tracking-tight transition hover:text-emerald-600 active:scale-95"
            title="点击发音"
          >
            {word.term} 🔊
          </button>
          <span className="text-sm text-slate-400">{word.phonetic}</span>
        </div>
        <p className="font-medium text-slate-700">{word.meaning}</p>
        {word.examples.map((ex) => (
          <div key={ex.en} className="rounded-2xl bg-slate-50/80 p-3 text-sm ring-1 ring-slate-900/5">
            <p className="text-slate-800">{ex.en}</p>
            <p className="mt-1 text-slate-400">{ex.zh}</p>
          </div>
        ))}
      </div>

      <Button className="w-full" onClick={onNext} autoFocus>
        下一题(回车)
      </Button>
    </Card>
  );
}
