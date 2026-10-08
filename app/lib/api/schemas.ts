import { z } from "zod";

// zod schema 即 API/存储契约(ADR-008):
// 静态内容加载校验、数据导入校验、阶段 1 API 请求/响应校验共用本文件。

export const CefrSchema = z.enum(["A1", "A2", "B1", "B2"]);
export const StageSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const VocabWordSchema = z.object({
  id: z.string().min(1),
  term: z.string().min(1),
  phonetic: z.string(),
  meaning: z.string().min(1),
  level: CefrSchema,
  stage: StageSchema,
  unit: z.string(),
  examples: z.array(z.object({ en: z.string(), zh: z.string() })),
  tags: z.array(z.string()),
});

export const GrammarLessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  level: CefrSchema,
  stage: StageSchema,
  points: z.array(z.string()),
  examples: z.array(z.object({ en: z.string(), zh: z.string() })),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string(),
    })
  ),
});

export const ReadingArticleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string(),
  level: CefrSchema,
  stage: StageSchema,
  wordCount: z.number().int().positive(),
  paragraphs: z.array(z.string()).min(1),
  glossary: z.array(z.object({ term: z.string(), zh: z.string() })),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string(),
    }),
  ),
});

export const ListeningItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string(),
  level: CefrSchema,
  stage: StageSchema,
  type: z.enum(["dialogue", "monologue"]),
  sentences: z.array(z.object({ en: z.string(), zh: z.string() })).min(3),
  questions: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()).min(2),
      answerIndex: z.number().int().nonnegative(),
      explanation: z.string(),
    }),
  ),
});

export const ReviewStateSchema = z.object({
  wordId: z.string(),
  easeFactor: z.number(),
  intervalDays: z.number(),
  repetitions: z.number().int(),
  dueDate: z.string(),
  lapses: z.number().int(),
  lastReviewedAt: z.string().nullable(),
  source: z.enum(["main", "reading"]).optional(),
  sourceArticleId: z.string().optional(),
});

export const StreakSchema = z.object({
  current: z.number().int(),
  longest: z.number().int(),
  lastActiveDate: z.string(),
  freezesLeft: z.number().int(),
  freezeResetMonth: z.string(),
});

export const AssessmentResultSchema = z.object({
  id: z.string(),
  type: z.enum(["placement", "monthly", "annual"]),
  takenAt: z.string(),
  cefrEstimated: CefrSchema,
  scores: z.object({
    listening: z.number(),
    reading: z.number(),
    grammar: z.number(),
    vocab: z.number(),
  }),
  weakPoints: z.array(z.string()),
});

export const ProgressSchema = z.object({
  userId: z.string(),
  stage: StageSchema,
  vocabPointer: z.string(),
  completedGrammarLessons: z.array(z.string()),
  readArticles: z.array(z.string()),
  assessmentHistory: z.array(AssessmentResultSchema),
  streak: StreakSchema,
  xp: z.number(),
  updatedAt: z.string(),
});

export const SettingsSchema = z.object({
  dailyNewWords: z.number().int().min(1).max(50),
  audioRate: z.union([z.literal(0.5), z.literal(0.75), z.literal(1), z.literal(1.25), z.literal(1.5)]),
  reminderEnabled: z.boolean(),
});

export const DailyLogSchema = z.object({
  date: z.string(),
  newWordsLearned: z.number().int(),
  reviewsDone: z.number().int(),
  minutes: z.number(),
  xp: z.number(),
  modulesTouched: z.array(
    z.enum(["vocab", "grammar-quiz", "listening-dictation", "reading-quiz", "pron-drill"])
  ),
});

export const OutboxEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
  attempts: z.number().int(),
});

export const LearningSessionSchema = z.object({
  id: z.string(),
  type: z.enum(["vocab", "grammar-quiz", "listening-dictation", "reading-quiz", "pron-drill"]),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  items: z.array(
    z.object({
      wordId: z.string(),
      kind: z.enum(["new", "review", "grammar", "reading", "pron"]),
      grade: z.number().int().nullable(),
      elapsedMs: z.number().int(),
    })
  ),
  xpEarned: z.number(),
});

export const ExportBundleSchema = z.object({
  app: z.literal("readtime"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: z.object({
    settings: SettingsSchema,
    progress: ProgressSchema,
    reviewStates: z.array(ReviewStateSchema),
    dailyLogs: z.array(DailyLogSchema),
    assessments: z.array(AssessmentResultSchema),
    // v1 后期补上的会话历史;旧备份没有该字段,导入时视为空
    sessions: z.array(LearningSessionSchema).optional(),
    // 离线同步队列(阶段 2 起上报 /api,现阶段随备份迁移);旧备份没有则视为空
    outbox: z.array(OutboxEntrySchema).optional(),
  }),
});
