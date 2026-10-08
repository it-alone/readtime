import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@remix-run/react";
import { levenshtein } from "~/lib/text";
import { exampleAudioUrl, speak, wordAudioUrl } from "~/lib/speech";
import { hashString, shuffleSeeded } from "~/lib/random";
import type { Grade, ItemResult, TaskItem, VocabWord } from "~/models/types";

// 答题卡(见 ARCHITECTURE.md §6.2 题型):
// choice 看词选义 / reverse 看义选词 / spell 听音拼写 / sentence 听句选义
// 评分:正确 5;拼写轻微错误(≤1-2 处)4;错误 2 → 统一进入 SM-2 调度
// audio 模式(听力巩固):提示不显示文字,自动播放发音,reverse 变"听音选词",sentence 播放例句

interface Option {
  label: string;
  isCorrect: boolean;
}

const QUIZ_LABEL = { choice: "词义", reverse: "回想", spell: "拼写", sentence: "听句" } as const;

/** 听句题的音频与释义取首条例句(词库无例句时退回词条本身) */
function sentenceAudio(word: VocabWord): string {
  return word.examples[0]?.en ?? word.term;
}

function sentenceMeaning(word: VocabWord): string {
  return word.examples[0]?.zh ?? word.meaning;
}

export function QuizCard({
  item,
  pool,
  onAnswer,
  audio = false,
  rate = 1,
}: {
  item: TaskItem;
  pool: VocabWord[];
  onAnswer: (result: ItemResult) => void;
  /** 听力模式:挂载时自动播放发音,reverse 提示改为播放按钮 */
  audio?: boolean;
  /** 发音语速(来自设置 audioRate) */
  rate?: number;
}) {
  const { word, quiz, kind } = item;
  const askedAt = useRef(Date.now());
  const [selected, setSelected] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);

  // 听力模式:每题挂载自动播放一次(父组件按题重挂)
  useEffect(() => {
    if (audio)
      speak(quiz === "sentence" ? sentenceAudio(word) : word.term, rate,
        quiz === "sentence" ? exampleAudioUrl(word.id) : wordAudioUrl(word.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  const options = useMemo<Option[]>(() => {
    if (quiz === "spell") return [];
    const valueOf = (w: VocabWord) =>
      quiz === "choice" ? w.meaning : quiz === "sentence" ? sentenceMeaning(w) : w.term;
    const seen = new Set<string>([valueOf(word)]);
    const others = pool.filter((w) => {
      if (w.id === word.id) return false;
      const v = valueOf(w);
      if (seen.has(v)) return false;
      seen.add(v);
      return true;
    });
    const distractors = shuffleSeeded(others, hashString(word.id + quiz)).slice(0, 3);
    const all: Option[] = [
      { label: valueOf(word), isCorrect: true },
      ...distractors.map((w) => ({ label: valueOf(w), isCorrect: false })),
    ];
    return shuffleSeeded(all, hashString(word.id));
  }, [word, quiz, pool]);

  function submitSpell(): void {
    if (done) return;
    const value = typed.trim().toLowerCase();
    const target = word.term.toLowerCase();
    let grade: Grade;
    let correct: boolean;
    if (value === target) {
      grade = 5;
      correct = true;
    } else if (levenshtein(value, target) <= (target.length >= 6 ? 2 : 1)) {
      grade = 4;
      correct = true;
    } else {
      grade = 2;
      correct = false;
    }
    setDone(true);
    onAnswer({ wordId: word.id, kind, grade, correct, elapsedMs: Date.now() - askedAt.current });
  }

  function submitChoice(index: number): void {
    if (done) return;
    setSelected(index);
    const correct = options[index].isCorrect;
    setDone(true);
    onAnswer({
      wordId: word.id,
      kind,
      grade: correct ? 5 : 2,
      correct,
      elapsedMs: Date.now() - askedAt.current,
    });
  }

  // 数字键 1-4 快捷选择(每次渲染重挂监听,确保闭包最新)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (done || quiz === "spell") return;
      if (e.target instanceof HTMLInputElement) return;
      if (/^[1-4]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < options.length) submitChoice(i);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            kind === "new"
              ? "bg-sky-50 text-sky-600 ring-1 ring-sky-200/60"
              : "bg-amber-50 text-amber-600 ring-1 ring-amber-200/60"
          }`}
        >
          {kind === "new" ? "新词" : "复习"}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
          {QUIZ_LABEL[quiz]}
        </span>
        {item.origin ? (
          <Link
            to={`/learn/reading/${item.origin.articleId}`}
            className="ml-auto rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-600 ring-1 ring-sky-200/60 transition hover:bg-sky-100"
            title="这个词来自阅读,回去看语境"
          >
            📖 回原文
          </Link>
        ) : null}
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-slate-50 to-emerald-50/70 px-6 py-8 text-center ring-1 ring-slate-900/5">
        {quiz === "choice" ? (
          <div className="space-y-2">
            <p className="text-4xl font-black tracking-tight text-slate-900">{word.term}</p>
            <p className="text-sm text-slate-400">{word.phonetic}</p>
            <button
              type="button"
              onClick={() => speak(word.term, rate, wordAudioUrl(word.id))}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-base text-emerald-600 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-50 active:scale-90"
              title="播放发音"
            >
              🔊
            </button>
          </div>
        ) : quiz === "reverse" ? (
          audio ? (
            <div className="space-y-3 py-2">
              <button
                type="button"
                onClick={() => speak(word.term, rate, wordAudioUrl(word.id))}
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-3xl text-white shadow-glow transition active:scale-90"
                title="再听一遍"
              >
                🔊
              </button>
              <p className="text-sm text-slate-400">听发音,选出你听到的单词</p>
            </div>
          ) : (
            <p className="text-2xl font-bold leading-snug text-slate-900">{word.meaning}</p>
          )
        ) : quiz === "sentence" ? (
          <div className="space-y-3 py-2">
            <button
              type="button"
              onClick={() => speak(sentenceAudio(word), rate, exampleAudioUrl(word.id))}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 text-3xl text-white shadow-glow transition active:scale-90"
              title="再听一遍"
            >
              🔊
            </button>
            <p className="text-sm text-slate-400">听例句,选出正确的中文意思</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-2xl font-bold leading-snug text-slate-900">{word.meaning}</p>
            <p className="text-sm text-slate-400">
              {audio ? "听发音,拼写对应的英文单词" : "拼写对应的英文单词"}
            </p>
            <button
              type="button"
              onClick={() => speak(word.term, rate, wordAudioUrl(word.id))}
              className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-base text-emerald-600 shadow-sm ring-1 ring-emerald-100 transition hover:bg-emerald-50 active:scale-90"
              title="播放发音"
            >
              🔊
            </button>
          </div>
        )}
      </div>

      {quiz === "spell" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSpell();
          }}
          className="flex gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={done}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="输入英文单词…"
            className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-lg shadow-sm transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={done || typed.trim().length === 0}
            className="rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition active:scale-95 disabled:from-slate-200 disabled:to-slate-200 disabled:shadow-none"
          >
            提交
          </button>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {options.map((opt, i) => {
            const state = !done
              ? "border-slate-200/80 bg-white hover:border-emerald-400 hover:shadow-sm"
              : opt.isCorrect
                ? "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-300"
                : i === selected
                  ? "border-rose-400 bg-rose-50/80 ring-1 ring-rose-200"
                  : "border-slate-200/60 bg-white opacity-40";
            return (
              <button
                key={`${item.word.id}-${i}`}
                type="button"
                disabled={done}
                onClick={() => submitChoice(i)}
                className={`flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-sm font-medium text-slate-800 transition-all duration-150 active:scale-[0.98] disabled:active:scale-100 ${state}`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                    done && opt.isCorrect
                      ? "bg-emerald-500 text-white"
                      : done && i === selected
                        ? "bg-rose-500 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {done && opt.isCorrect ? "✓" : done && i === selected ? "✕" : i + 1}
                </span>
                <span className="leading-snug">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
