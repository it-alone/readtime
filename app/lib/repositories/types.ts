import type {
  CEFR,
  DailyLog,
  GrammarLesson,
  LearningSession,
  ListeningItem,
  Progress,
  ReadingArticle,
  ReviewState,
  Settings,
  Stage,
  VocabWord,
} from "~/models/types";
import type { CompletionTx } from "~/lib/storage/db";

// Repository 接口(见 ARCHITECTURE.md §7/§9):
// UI 与领域层只依赖这些接口;存储实现(localStorage 时代已排除,现为 IndexedDB,
// 阶段 2 切换 Api 实现时上层零改动)。

export interface ReviewRepository {
  /** 到期复习状态,按到期时间升序 */
  getDue(now: Date, limit?: number): Promise<ReviewState[]>;
  getMany(wordIds: string[]): Promise<ReviewState[]>;
  upsertMany(states: ReviewState[], tx?: CompletionTx): Promise<void>;
  count(): Promise<number>;
  /** 弱词榜:lapses 降序、EF 升序(周报弱项诊断用) */
  getWeakest(limit?: number): Promise<ReviewState[]>;
  /** 全部复习状态,按到期时间升序(听力等补充练习选词用) */
  all(): Promise<ReviewState[]>;
}

export interface ProgressRepository {
  get(): Promise<Progress>;
  save(progress: Progress, tx?: CompletionTx): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

export interface DailyLogRepository {
  get(date: string): Promise<DailyLog>;
  getAll(): Promise<DailyLog[]>;
  upsert(log: DailyLog, tx?: CompletionTx): Promise<void>;
}

export interface SessionRepository {
  /** 最近 n 场会话,新 → 旧 */
  recent(limit: number): Promise<LearningSession[]>;
  /** startedAt >= cutoff 的会话(ISO 字符串,按 by-startedAt 索引区间查询) */
  since(cutoff: string): Promise<LearningSession[]>;
}

/** 语法课程轻量索引项(列表页用;正文/例句/题目在分片 JSON 里按需取) */
export interface GrammarLessonMeta {
  id: string;
  title: string;
  summary: string;
  level: CEFR;
  stage: Stage;
  questionCount: number;
  /** 所在分片序号(1 起),详情加载时只取这一片 */
  part: number;
}

/** 阅读文章轻量索引项 */
export interface ReadingArticleMeta {
  id: string;
  title: string;
  topic: string;
  summary: string;
  level: CEFR;
  stage: Stage;
  wordCount: number;
  questionCount: number;
  part: number;
}

/** 听力素材轻量索引项 */
export interface ListeningItemMeta {
  id: string;
  title: string;
  topic: string;
  summary: string;
  level: CEFR;
  stage: Stage;
  type: "dialogue" | "monologue";
  sentenceCount: number;
  questionCount: number;
  part: number;
}

/**
 * 静态内容仓储:海量内容(3000+ 课/篇)按 §11 预算分片(index + part-XX,单文件 ≤ 500KB,
 * 索引过大再拆 index-part),列表页只拉索引(meta),详情页按 id 定位到单片懒加载,避免一次性载入 20MB+。
 */
export interface ContentRepository {
  loadStage(stage: Stage): Promise<VocabWord[]>;
  /** 语法课程全量索引(按 id 数字序) */
  loadGrammarIndex(): Promise<GrammarLessonMeta[]>;
  getGrammarLesson(id: string): Promise<GrammarLesson | undefined>;
  /** 阅读文章全量索引(l2 + l3 合并,按 id 数字序) */
  loadReadingIndex(): Promise<ReadingArticleMeta[]>;
  getReadingArticle(id: string): Promise<ReadingArticle | undefined>;
  /** 按需取指定文章(发音跟读回原文用;只加载命中的分片) */
  getReadingArticlesByIds(ids: string[]): Promise<ReadingArticle[]>;
  /** 听力素材全量索引(按 id 数字序) */
  loadListeningIndex(): Promise<ListeningItemMeta[]>;
  getListeningItem(id: string): Promise<ListeningItem | undefined>;
}

export interface OutboxRepository {
  append(entries: unknown[], tx?: CompletionTx): Promise<void>;
  getAll(): Promise<unknown[]>;
}
