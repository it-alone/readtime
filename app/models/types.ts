// 领域模型(前后端共享,见 ARCHITECTURE.md §5)

export type CEFR = "A1" | "A2" | "B1" | "B2";
export type Stage = 1 | 2 | 3;
export type Grade = 0 | 1 | 2 | 3 | 4 | 5;
export type QuizKind = "choice" | "reverse" | "spell" | "sentence";

export interface VocabWord {
  id: string;
  term: string;
  phonetic: string;
  meaning: string;
  level: CEFR;
  stage: Stage;
  unit: string;
  examples: { en: string; zh: string }[];
  tags: string[];
}

/** 生词来源:主线每日任务(undefined=旧数据,视同主线)或阅读点词加入 */
export type WordSource = "main" | "reading";

/** SM-2 复习状态(每词一条) */
export interface ReviewState {
  wordId: string;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  dueDate: string;
  lapses: number;
  lastReviewedAt: string | null;
  source?: WordSource;
  /** 阅读来源生词:加入复习时的文章 id,复习卡片据此提供"回原文" */
  sourceArticleId?: string;
}

export type SessionType =
  | "vocab"
  | "grammar-quiz"
  | "listening-dictation"
  | "reading-quiz"
  | "pron-drill";

export interface SessionItem {
  wordId: string;
  /** 词汇/听力会话:new=首次学习、review=复习;语法/阅读会话:题目 id 存于 wordId;发音会话:例句所属词 id */
  kind: "new" | "review" | "grammar" | "reading" | "pron";
  grade: Grade | null;
  elapsedMs: number;
}

export interface LearningSession {
  id: string;
  type: SessionType;
  startedAt: string;
  endedAt: string | null;
  items: SessionItem[];
  xpEarned: number;
}

export interface DailyLog {
  date: string;
  newWordsLearned: number;
  reviewsDone: number;
  minutes: number;
  xp: number;
  modulesTouched: SessionType[];
}

export interface AssessmentResult {
  id: string;
  type: "placement" | "monthly" | "annual";
  takenAt: string;
  cefrEstimated: CEFR;
  scores: { listening: number; reading: number; grammar: number; vocab: number };
  weakPoints: string[];
}

export interface Streak {
  current: number;
  longest: number;
  lastActiveDate: string;
  freezesLeft: number;
  freezeResetMonth: string;
}

export interface Progress {
  userId: string;
  stage: Stage;
  vocabPointer: string;
  completedGrammarLessons: string[];
  readArticles: string[];
  assessmentHistory: AssessmentResult[];
  streak: Streak;
  xp: number;
  updatedAt: string;
}

export interface Settings {
  dailyNewWords: number;
  audioRate: 0.5 | 0.75 | 1 | 1.25 | 1.5;
  reminderEnabled: boolean;
}

export interface OutboxEntry {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export interface TaskItem {
  word: VocabWord;
  kind: "new" | "review";
  quiz: QuizKind;
  /** 复习项若是阅读点词加入的,带上来源文章,卡片渲染"回原文"入口 */
  origin?: { articleId: string };
}

export interface VocabTask {
  items: TaskItem[];
  goal: { newTarget: number; newDone: number; dueCount: number };
}

export interface ItemResult {
  wordId: string;
  kind: "new" | "review";
  grade: Grade;
  correct: boolean;
  elapsedMs: number;
}

export interface CompletionSummary {
  xpEarned: number;
  streak: Streak;
  newCount: number;
  reviewedCount: number;
  streakProtected: boolean;
}

export interface GrammarQuestion {
  id: string;
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface GrammarLesson {
  id: string;
  title: string;
  summary: string;
  level: CEFR;
  stage: Stage;
  points: string[];
  examples: { en: string; zh: string }[];
  questions: GrammarQuestion[];
}

/** 第二年场景阅读短文(题干与语法题同构) */
export interface ReadingArticle {
  id: string;
  title: string;
  topic: string;
  summary: string;
  level: CEFR;
  stage: Stage;
  wordCount: number;
  paragraphs: string[];
  glossary: { term: string; zh: string }[];
  questions: GrammarQuestion[];
}

/** 听力精听素材:A1–B1 对话/独白,逐句双语文本 + 理解题(题干与语法题同构) */
export interface ListeningItem {
  id: string;
  title: string;
  topic: string;
  summary: string;
  level: CEFR;
  stage: Stage;
  type: "dialogue" | "monologue";
  sentences: { en: string; zh: string }[];
  questions: GrammarQuestion[];
}

export const MONTHLY_FREEZES = 2;

/**
 * 词库指针哨兵:三个 stage 的词全部学完后指向它(此时每日任务不再出新词,
 * 只保留 SM-2 复习)。空串 "" 表示指向起点。
 */
export const VOCAB_POINTER_END = "__end__";

export const DEFAULT_SETTINGS: Settings = {
  dailyNewWords: 10,
  audioRate: 1,
  reminderEnabled: false,
};
