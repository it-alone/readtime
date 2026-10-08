import { updateStreak, todayStr } from "~/lib/gamify/streak";
import { computeSessionXp, computeListeningXp, computeGrammarXp, computeReadingXp, computePronXp } from "~/lib/gamify/xp";
import { buildVocabTask } from "~/lib/scheduler/daily";
import { buildListeningTask, LISTENING_SESSION_SIZE } from "~/lib/scheduler/listening";
import {
  buildPronDrill,
  collectReadingSentences,
  pronDailySeed,
  PRON_FALLBACK_SIZE,
  type PronDrillItem,
} from "~/lib/scheduler/pron";
import { createSm2Scheduler } from "~/lib/srs/sm2";
import { shuffleSeeded } from "~/lib/random";
import { makeOutboxEntry, newUuid } from "~/lib/outbox/outbox";
import { computeRetentionRate, retentionSamples } from "~/lib/diagnosis/retention";
import { summarizeModules, type ModuleSummary } from "~/lib/diagnosis/modules";
import {
  persistCompletion,
  persistWordSeed,
  IdbDailyLogRepository,
  IdbProgressRepository,
  IdbReviewRepository,
  IdbSessionRepository,
  IdbSettingsRepository,
} from "~/lib/repositories/idb-repositories";
import { StaticContentRepository } from "~/lib/repositories/content";
import { exportBundle, importBundle, storageEstimate, dataOverview } from "~/lib/storage/exporter";
import type { ExportBundle } from "~/lib/storage/types";
import type {
  ContentRepository,
  DailyLogRepository,
  GrammarLessonMeta,
  ListeningItemMeta,
  ProgressRepository,
  ReadingArticleMeta,
  ReviewRepository,
  SessionRepository,
  SettingsRepository,
} from "~/lib/repositories/types";
import type {
  CompletionSummary,
  DailyLog,
  GrammarLesson,
  ItemResult,
  LearningSession,
  ListeningItem,
  Progress as ProgressType,
  ReadingArticle,
  ReviewState,
  Settings,
  Stage,
  TaskItem,
  VocabTask,
  VocabWord,
} from "~/models/types";
import { VOCAB_POINTER_END } from "~/models/types";

// 服务装配(见 ARCHITECTURE.md §2.2/§9):
// 阶段 0 = LocalApiClient(IndexedDB + 静态内容);阶段 2 在此切换 Api 实现。

/** 弱词条目(周报弱项诊断用;source 标记是主线学的还是阅读点词加入的) */
export interface WeakWord {
  word: VocabWord;
  lapses: number;
  easeFactor: number;
  source: import("~/models/types").WordSource;
  /** 阅读来源弱词的文章 id,周报可链接回原文 */
  sourceArticleId?: string;
}

export interface VocabService {
  getTodayTask(now?: Date): Promise<VocabTask>;
  completeSession(results: ItemResult[], startedAt: Date, now?: Date): Promise<CompletionSummary>;
  learnedWordCount(): Promise<number>;
  distractorPool(count: number): Promise<VocabWord[]>;
  /** 听力巩固:从已学词生成听音选词/听写任务(未学任何词时 items 为空) */
  buildListeningPractice(now?: Date): Promise<{
    task: VocabTask;
    distractors: VocabWord[];
    rate: number;
  }>;
  /** 听力会话结算:不触碰 SM-2 与词库指针,仅记录会话/日志/XP */
  completeListeningSession(
    results: ItemResult[],
    startedAt: Date,
    now?: Date
  ): Promise<CompletionSummary>;
  /** 近期复习留存率(样本不足时 rate 为 undefined) */
  recentRetention(): Promise<{ rate: number | undefined; samples: number }>;
  /** 弱词榜:lapses 降序、EF 升序 */
  weakWords(limit?: number): Promise<WeakWord[]>;
  /** 按拼写查词(大小写不敏感;阅读生词标注用) */
  findByTerm(term: string): Promise<VocabWord | undefined>;
  /** 全量词表(词库浏览页用;stage 为 1/2/3,懒加载对应年份的词库) */
  listStageWords(stage: Stage): Promise<VocabWord[]>;
  /**
   * 阅读生词入库:为词库中的词建立 SM-2 初始复习状态(按答对计,次日到期),
   * 已有状态则跳过(幂等)。不构成会话、不计 XP、不动词库指针。
   */
  /** 阅读点词加入复习计划(记录来源文章,复习卡片据此提供"回原文");已在计划中则不重复 */
  seedReview(wordId: string, now?: Date, sourceArticleId?: string): Promise<{ seeded: boolean }>;
}

/** 语法练习逐题结果(questionId 存入会话记录的 wordId 字段) */
export interface GrammarItemResult {
  questionId: string;
  correct: boolean;
  elapsedMs: number;
}

export interface GrammarService {
  /** 课程索引(轻量 meta,列表页用;正文与题目经 getLesson 按片懒加载) */
  listLessons(): Promise<GrammarLessonMeta[]>;
  getLesson(id: string): Promise<GrammarLesson | undefined>;
  /**
   * 课程练习结算:记录会话(grammar-quiz)/日志/XP 并标记完成;
   * 首次完成额外给会话完成奖励,重复练习只按题计分(防刷分)。
   */
  completeLesson(
    lessonId: string,
    results: GrammarItemResult[],
    startedAt: Date,
    now?: Date
  ): Promise<CompletionSummary>;
}

/** 阅读理解逐题结果(题目 id 存入会话记录的 wordId 字段) */
export interface ReadingItemResult {
  questionId: string;
  correct: boolean;
  elapsedMs: number;
}

export interface ReadingService {
  /** 文章索引(轻量 meta,l2+l3 合并;正文经 getArticle 按片懒加载) */
  listArticles(): Promise<ReadingArticleMeta[]>;
  getArticle(id: string): Promise<ReadingArticle | undefined>;
  /**
   * 阅读结算:记录会话(reading-quiz)/日志/XP 并计入 readArticles;
   * 首次完成额外给会话完成奖励,重复阅读只按题计分(防刷分)。
   */
  completeArticle(
    articleId: string,
    results: ReadingItemResult[],
    startedAt: Date,
    now?: Date
  ): Promise<CompletionSummary>;
}

/** 听力精听素材逐题结果(questionId 存入会话记录的 wordId 字段) */
export interface ListeningItemResult {
  questionId: string;
  correct: boolean;
  elapsedMs: number;
}

export interface ListeningLibraryService {
  /** 素材索引(轻量 meta;台词与题目经 getItem 按片懒加载) */
  listItems(): Promise<ListeningItemMeta[]>;
  getItem(id: string): Promise<ListeningItem | undefined>;
  /**
   * 精听结算:与听写巩固同通道(不写 SM-2、不动词库指针),
   * 记录会话(listening-dictation)/日志/XP。
   */
  completeItem(
    itemId: string,
    results: ListeningItemResult[],
    startedAt: Date,
    now?: Date
  ): Promise<CompletionSummary>;
}

/** 发音跟读逐句结果(score 为 0–100,correct = 达到及格分) */
export interface PronItemResult {
  wordId: string;
  score: number;
  correct: boolean;
  elapsedMs: number;
}

export interface PronService {
  /** 跟读任务:已学词例句 + 已读文章整句(词库为空时退回词库开头),每日种子稳定 */
  buildDrill(now?: Date): Promise<{ items: PronDrillItem[]; rate: number }>;
  /** 发音会话结算:不触碰 SM-2 与词库指针,仅记录会话/日志/XP */
  completeDrill(
    results: PronItemResult[],
    startedAt: Date,
    now?: Date
  ): Promise<CompletionSummary>;
}

export interface StorageAdmin {
  exportAll(): Promise<ExportBundle>;
  importAll(bundle: unknown): Promise<void>;
  estimate(): Promise<{ usage: number; quota: number } | null>;
  /** 数据概览(设置页展示,导出前预览将要备份的内容) */
  overview(): Promise<{
    learnedWords: number;
    sessions: number;
    activeDays: number;
    xp: number;
    grammarLessonsDone: number;
    articlesRead: number;
  }>;
}

export interface StatsService {
  /** 近 7 天各模块训练汇总(周报展示与均衡度建议) */
  moduleSummary(now?: Date): Promise<ModuleSummary[]>;
}

export interface Services {
  vocab: VocabService;
  grammar: GrammarService;
  reading: ReadingService;
  listening: ListeningLibraryService;
  pron: PronService;
  progress: ProgressRepository;
  settings: SettingsRepository;
  logs: DailyLogRepository;
  stats: StatsService;
  storage: StorageAdmin;
}

function indexOfPointer(stageWords: VocabWord[], pointer: string): number {
  if (pointer === VOCAB_POINTER_END) return stageWords.length;
  if (!pointer) return 0;
  const idx = stageWords.findIndex((w) => w.id === pointer);
  return idx === -1 ? 0 : idx;
}

/** 加载第 1..stage 年的全部词表(跨年复习词解析用;各 stage 有内存缓存,重复加载零开销) */
async function loadStagesUpTo(content: ContentRepository, stage: Stage): Promise<VocabWord[]> {
  const stages: Stage[] = [];
  for (let s = 1; s <= stage; s++) stages.push(s as Stage);
  return (await Promise.all(stages.map((s) => content.loadStage(s)))).flat();
}

function createLocalServices(): Services {
  const reviews: ReviewRepository = new IdbReviewRepository();
  const progressRepo: ProgressRepository = new IdbProgressRepository();
  const settingsRepo: SettingsRepository = new IdbSettingsRepository();
  const logs: DailyLogRepository = new IdbDailyLogRepository();
  const sessions: SessionRepository = new IdbSessionRepository();
  const content: ContentRepository = new StaticContentRepository();

  const vocab: VocabService = {
    async getTodayTask(now = new Date()) {
      const [settings, progress, log, dueStates, recentSessions] = await Promise.all([
        settingsRepo.get(),
        progressRepo.get(),
        logs.get(todayStr(now)),
        reviews.getDue(now, Number.POSITIVE_INFINITY),
        sessions.recent(20),
      ]);
      const stageWords = await content.loadStage(progress.stage);
      // 到期复习可能来自往年词表(stage 推进后旧词仍在 SM-2 队列),按 1..stage 合并解析
      const wordById = new Map(
        (await loadStagesUpTo(content, progress.stage)).map((w) => [w.id, w]),
      );
      const dueWords = dueStates
        .map((s) => wordById.get(s.wordId))
        .filter((w): w is VocabWord => w !== undefined);
      // 留存率闭环:近期复习正确率 < 0.8 时调度器减半新词(PLAN.md 风险应对)
      const task = buildVocabTask({
        dueWords,
        stageWords,
        pointerIndex: indexOfPointer(stageWords, progress.vocabPointer),
        dailyNewTarget: settings.dailyNewWords,
        newDoneToday: log.newWordsLearned,
        retentionRate: computeRetentionRate(recentSessions),
      });
      // 阅读来源的复习项带上来源文章,卡片渲染"回原文"
      const stateById = new Map(dueStates.map((s) => [s.wordId, s]));
      const items = task.items.map((it) => {
        const st = it.kind === "review" ? stateById.get(it.word.id) : undefined;
        return st?.source === "reading" && st.sourceArticleId
          ? { ...it, origin: { articleId: st.sourceArticleId } }
          : it;
      });
      return { ...task, items };
    },

    async completeSession(results, startedAt, now = new Date()) {
      const srs = createSm2Scheduler();
      const [progress, existing] = await Promise.all([
        progressRepo.get(),
        reviews.getMany(results.map((r) => r.wordId)),
      ]);
      const byId = new Map(existing.map((s) => [s.wordId, s]));
      const states: ReviewState[] = results.map((r) =>
        srs.schedule(byId.get(r.wordId) ?? srs.init(r.wordId, now), r.grade, now)
      );

      const xpEarned = computeSessionXp(results);
      const { streak, protectedByFreeze } = updateStreak(progress.streak, now);
      const newCount = results.filter((r) => r.kind === "new").length;
      const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

      const log = await logs.get(todayStr(now));
      const mergedLog: DailyLog = {
        ...log,
        newWordsLearned: log.newWordsLearned + newCount,
        reviewsDone: log.reviewsDone + (results.length - newCount),
        minutes: log.minutes + minutes,
        xp: log.xp + xpEarned,
        modulesTouched: log.modulesTouched.includes("vocab")
          ? log.modulesTouched
          : [...log.modulesTouched, "vocab"],
      };

      const stageWords = await content.loadStage(progress.stage);
      const baseIdx = indexOfPointer(stageWords, progress.vocabPointer);
      // 指针推进 + 阶段推进:当年词库学完自动进入下一年(stage 1→2→3),
      // 三年全部学完则指向 VOCAB_POINTER_END,主线不再出新词、只保留复习
      const exhausted = baseIdx + newCount >= stageWords.length;
      let nextStage: Stage = progress.stage;
      let nextPointer: string;
      if (!exhausted) {
        nextPointer = stageWords[baseIdx + newCount].id;
      } else if (progress.stage < 3) {
        nextStage = (progress.stage + 1) as Stage;
        nextPointer = "";
      } else {
        nextPointer = VOCAB_POINTER_END;
      }
      const nextProgress: ProgressType = {
        ...progress,
        streak,
        xp: progress.xp + xpEarned,
        stage: nextStage,
        vocabPointer: nextPointer,
        updatedAt: now.toISOString(),
      };

      const session: LearningSession = {
        id: newUuid(),
        type: "vocab",
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
        items: results.map((r) => ({
          wordId: r.wordId,
          kind: r.kind,
          grade: r.grade,
          elapsedMs: r.elapsedMs,
        })),
        xpEarned,
      };

      await persistCompletion({
        states,
        log: mergedLog,
        progress: nextProgress,
        session,
        entry: makeOutboxEntry(
          "vocab-session",
          { results, xpEarned, startedAt: startedAt.toISOString(), finishedAt: now.toISOString() },
          now
        ),
      });

      return {
        xpEarned,
        streak,
        newCount,
        reviewedCount: results.length - newCount,
        streakProtected: protectedByFreeze,
      };
    },

    async learnedWordCount() {
      return reviews.count();
    },

    async distractorPool(count: number) {
      const progress = await progressRepo.get();
      const words = await content.loadStage(progress.stage);
      return shuffleSeeded(words, Date.now() % 2147483647).slice(0, count);
    },

    async buildListeningPractice(now = new Date()) {
      const [progress, settings, states] = await Promise.all([
        progressRepo.get(),
        settingsRepo.get(),
        reviews.all(),
      ]);
      const stageWords = await content.loadStage(progress.stage);
      // 已学词可能来自往年(阅读点词/往年主线),跨 stage 解析
      const wordById = new Map(
        (await loadStagesUpTo(content, progress.stage)).map((w) => [w.id, w]),
      );
      // 最逾期的词优先进入听力练习(与复习队列同序;调度器按入参序取前 N,dueDate 为 ISO 串可直接字典序)
      const candidates = [...states]
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((s) => wordById.get(s.wordId))
        .filter((w): w is VocabWord => w !== undefined);
      const seed = now.getTime() % 2147483647;
      const task = buildListeningTask({
        words: candidates,
        count: LISTENING_SESSION_SIZE,
        seed,
      });
      // 阅读来源的词同样带"回原文"入口(QuizCard 渲染 item.origin)
      const stateById = new Map(states.map((s) => [s.wordId, s]));
      const items = task.items.map((it) => {
        const st = stateById.get(it.word.id);
        return st?.source === "reading" && st.sourceArticleId
          ? { ...it, origin: { articleId: st.sourceArticleId } }
          : it;
      });
      return {
        task: { ...task, items },
        distractors: shuffleSeeded(stageWords, seed).slice(0, 24),
        rate: settings.audioRate,
      };
    },

    async completeListeningSession(results, startedAt, now = new Date()) {
      const xpEarned = computeListeningXp(results);
      const [progress, log] = await Promise.all([progressRepo.get(), logs.get(todayStr(now))]);
      const { streak, protectedByFreeze } = updateStreak(progress.streak, now);
      const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

      const mergedLog: DailyLog = {
        ...log,
        reviewsDone: log.reviewsDone + results.length,
        minutes: log.minutes + minutes,
        xp: log.xp + xpEarned,
        modulesTouched: log.modulesTouched.includes("listening-dictation")
          ? log.modulesTouched
          : [...log.modulesTouched, "listening-dictation"],
      };
      const nextProgress: ProgressType = {
        ...progress,
        streak,
        xp: progress.xp + xpEarned,
        updatedAt: now.toISOString(),
      };
      const session: LearningSession = {
        id: newUuid(),
        type: "listening-dictation",
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
        items: results.map((r) => ({
          wordId: r.wordId,
          kind: r.kind,
          grade: r.grade,
          elapsedMs: r.elapsedMs,
        })),
        xpEarned,
      };
      await persistCompletion({
        states: [], // 听力不写 SM-2,间隔调度仍以词汇会话的评分为准
        log: mergedLog,
        progress: nextProgress,
        session,
        entry: makeOutboxEntry("listening-session", { results, xpEarned }, now),
      });
      return {
        xpEarned,
        streak,
        newCount: 0,
        reviewedCount: results.length,
        streakProtected: protectedByFreeze,
      };
    },

    async recentRetention() {
      const recent = await sessions.recent(20);
      return { rate: computeRetentionRate(recent), samples: retentionSamples(recent) };
    },

    async weakWords(limit = 10): Promise<WeakWord[]> {
      const [progress, weakest] = await Promise.all([
        progressRepo.get(),
        reviews.getWeakest(limit),
      ]);
      if (weakest.length === 0) return [];
      // 弱词可能来自往年词表,按 1..stage 合并解析(否则旧年弱词在周报里凭空消失)
      const wordById = new Map(
        (await loadStagesUpTo(content, progress.stage)).map((w) => [w.id, w]),
      );
      return weakest
        .map((s) => {
          const word = wordById.get(s.wordId);
          return word
            ? {
                word,
                lapses: s.lapses,
                easeFactor: s.easeFactor,
                source: s.source ?? "main",
                ...(s.sourceArticleId ? { sourceArticleId: s.sourceArticleId } : {}),
              }
            : null;
        })
        .filter((w): w is WeakWord => w !== null);
    },
    async findByTerm(term) {
      // 阅读点词可能命中任意年份的词库(glossary 校验保证 ⊆ 三 stage 词库),全库查找
      const t = term.trim().toLowerCase();
      for (const s of [1, 2, 3] as Stage[]) {
        const stageWords = await content.loadStage(s);
        const hit = stageWords.find((w) => w.term.toLowerCase() === t);
        if (hit) return hit;
      }
      return undefined;
    },
    async listStageWords(stage) {
      return content.loadStage(stage);
    },
    async seedReview(wordId, now = new Date(), sourceArticleId?: string) {
      const existing = await reviews.getMany([wordId]);
      if (existing.length > 0) return { seeded: false };
      const srs = createSm2Scheduler();
      const state: ReviewState = {
        ...srs.schedule(srs.init(wordId, now), 5, now),
        source: "reading",
        ...(sourceArticleId ? { sourceArticleId } : {}),
      };
      await persistWordSeed(
        state,
        makeOutboxEntry("word-seed", { wordId, source: "reading", sourceArticleId }, now),
      );
      return { seeded: true };
    },
  };

  const grammar: GrammarService = {
    async listLessons() {
      return content.loadGrammarIndex();
    },
    async getLesson(id) {
      return content.getGrammarLesson(id);
    },
    async completeLesson(lessonId, results, startedAt, now = new Date()) {
      const lesson = await content.getGrammarLesson(lessonId);
      if (!lesson) throw new Error(`语法课程不存在:${lessonId}`);

      const [progress, log] = await Promise.all([progressRepo.get(), logs.get(todayStr(now))]);
      const firstCompletion = !progress.completedGrammarLessons.includes(lessonId);
      const correctCount = results.filter((r) => r.correct).length;
      const xpEarned = computeGrammarXp(correctCount, results.length, firstCompletion);
      const { streak, protectedByFreeze } = updateStreak(progress.streak, now);
      const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

      const mergedLog: DailyLog = {
        ...log,
        minutes: log.minutes + minutes,
        xp: log.xp + xpEarned,
        modulesTouched: log.modulesTouched.includes("grammar-quiz")
          ? log.modulesTouched
          : [...log.modulesTouched, "grammar-quiz"],
      };
      const nextProgress: ProgressType = {
        ...progress,
        streak,
        xp: progress.xp + xpEarned,
        completedGrammarLessons: firstCompletion
          ? [...progress.completedGrammarLessons, lessonId]
          : progress.completedGrammarLessons,
        updatedAt: now.toISOString(),
      };
      const session: LearningSession = {
        id: newUuid(),
        type: "grammar-quiz",
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
        items: results.map((r) => ({
          wordId: r.questionId,
          kind: "grammar" as const,
          grade: r.correct ? 5 : 2,
          elapsedMs: r.elapsedMs,
        })),
        xpEarned,
      };
      await persistCompletion({
        states: [], // 语法练习不写 SM-2
        log: mergedLog,
        progress: nextProgress,
        session,
        entry: makeOutboxEntry("grammar-session", { lessonId, results, xpEarned }, now),
      });
      return {
        xpEarned,
        streak,
        newCount: 0,
        reviewedCount: results.length,
        streakProtected: protectedByFreeze,
      };
    },
  };

  const reading: ReadingService = {
    async listArticles() {
      return content.loadReadingIndex();
    },
    async getArticle(id) {
      return content.getReadingArticle(id);
    },
    async completeArticle(articleId, results, startedAt, now = new Date()) {
      const article = await content.getReadingArticle(articleId);
      if (!article) throw new Error(`阅读素材不存在:${articleId}`);

      const [progress, log] = await Promise.all([progressRepo.get(), logs.get(todayStr(now))]);
      const firstCompletion = !progress.readArticles.includes(articleId);
      const correctCount = results.filter((r) => r.correct).length;
      const xpEarned = computeReadingXp(correctCount, results.length, firstCompletion);
      const { streak, protectedByFreeze } = updateStreak(progress.streak, now);
      const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

      const mergedLog: DailyLog = {
        ...log,
        minutes: log.minutes + minutes,
        xp: log.xp + xpEarned,
        modulesTouched: log.modulesTouched.includes("reading-quiz")
          ? log.modulesTouched
          : [...log.modulesTouched, "reading-quiz"],
      };
      const nextProgress: ProgressType = {
        ...progress,
        streak,
        xp: progress.xp + xpEarned,
        readArticles: firstCompletion ? [...progress.readArticles, articleId] : progress.readArticles,
        updatedAt: now.toISOString(),
      };
      const session: LearningSession = {
        id: newUuid(),
        type: "reading-quiz",
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
        items: results.map((r) => ({
          wordId: r.questionId,
          kind: "reading" as const,
          grade: r.correct ? 5 : 2,
          elapsedMs: r.elapsedMs,
        })),
        xpEarned,
      };
      await persistCompletion({
        states: [], // 阅读练习不写 SM-2
        log: mergedLog,
        progress: nextProgress,
        session,
        entry: makeOutboxEntry("reading-session", { articleId, results, xpEarned }, now),
      });
      return {
        xpEarned,
        streak,
        newCount: 0,
        reviewedCount: results.length,
        streakProtected: protectedByFreeze,
      };
    },
  };

  const listening: ListeningLibraryService = {
    async listItems() {
      return content.loadListeningIndex();
    },
    async getItem(id) {
      return content.getListeningItem(id);
    },
    async completeItem(itemId, results, startedAt, now = new Date()) {
      // 与听写巩固同一结算通道:题号入 wordId 字段,不触碰 SM-2 与词库指针
      if (!(await content.getListeningItem(itemId))) throw new Error(`听力素材不存在:${itemId}`);
      const mapped: ItemResult[] = results.map((r) => ({
        wordId: r.questionId,
        kind: "review",
        grade: r.correct ? 5 : 2,
        correct: r.correct,
        elapsedMs: r.elapsedMs,
      }));
      return vocab.completeListeningSession(mapped, startedAt, now);
    },
  };

  const pron: PronService = {
    async buildDrill(now = new Date()) {
      const [progress, settings, states] = await Promise.all([
        progressRepo.get(),
        settingsRepo.get(),
        reviews.all(),
      ]);
      const [stageWords, readArticles] = await Promise.all([
        content.loadStage(progress.stage),
        // 只拉已读文章命中的分片,而不是整库(3 千+ 篇的正文)
        content.getReadingArticlesByIds(progress.readArticles),
      ]);
      // 已学词跨年解析(学过的词都会进入跟读素材池)
      const byId = new Map(
        (await loadStagesUpTo(content, progress.stage)).map((w) => [w.id, w]),
      );
      const learned = states
        .map((s) => byId.get(s.wordId))
        .filter((w): w is VocabWord => w !== undefined);
      // 没学过词也能练:退回词库开头,朗读本身就是练习
      const pool = learned.length > 0 ? learned : stageWords.slice(0, PRON_FALLBACK_SIZE);
      // 已读文章的整句也进入跟读素材(打通阅读↔发音)
      const sentences = collectReadingSentences(readArticles, progress.readArticles);
      const items = buildPronDrill(pool, sentences, pronDailySeed(`pron-${todayStr(now)}`));
      return {
        items,
        rate: settings.audioRate,
      };
    },
    async completeDrill(results, startedAt, now = new Date()) {
      const correctCount = results.filter((r) => r.correct).length;
      const xpEarned = computePronXp(correctCount, results.length);
      const [progress, log] = await Promise.all([progressRepo.get(), logs.get(todayStr(now))]);
      const { streak, protectedByFreeze } = updateStreak(progress.streak, now);
      const minutes = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));

      const mergedLog: DailyLog = {
        ...log,
        minutes: log.minutes + minutes,
        xp: log.xp + xpEarned,
        modulesTouched: log.modulesTouched.includes("pron-drill")
          ? log.modulesTouched
          : [...log.modulesTouched, "pron-drill"],
      };
      const nextProgress: ProgressType = {
        ...progress,
        streak,
        xp: progress.xp + xpEarned,
        updatedAt: now.toISOString(),
      };
      const session: LearningSession = {
        id: newUuid(),
        type: "pron-drill",
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
        items: results.map((r) => ({
          wordId: r.wordId,
          kind: "pron" as const,
          grade: r.correct ? 5 : 2,
          elapsedMs: r.elapsedMs,
        })),
        xpEarned,
      };
      await persistCompletion({
        states: [], // 跟读不写 SM-2,间隔调度仍以词汇会话的评分为准
        log: mergedLog,
        progress: nextProgress,
        session,
        entry: makeOutboxEntry("pron-session", { results, xpEarned }, now),
      });
      return {
        xpEarned,
        streak,
        newCount: 0,
        reviewedCount: results.length,
        streakProtected: protectedByFreeze,
      };
    },
  };

  const stats: StatsService = {
    async moduleSummary(now = new Date()) {
      const cutoff = new Date(now.getTime() - 7 * 86_400_000);
      const recent = await sessions.since(cutoff.toISOString());
      return summarizeModules(recent, now);
    },
  };

  return {
    vocab,
    grammar,
    reading,
    listening,
    pron,
    progress: progressRepo,
    settings: settingsRepo,
    logs,
    stats,
    storage: {
      exportAll: exportBundle,
      importAll: importBundle,
      estimate: storageEstimate,
      overview: dataOverview,
    },
  };
}

let cached: Services | null = null;

/** 浏览器端服务单例(构建期预渲染无 window,不可调用) */
export function getServices(): Services {
  if (typeof window === "undefined") {
    throw new Error("getServices() 仅可在浏览器调用");
  }
  cached ??= createLocalServices();
  return cached;
}

export type { TaskItem };
