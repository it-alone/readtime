import { z } from "zod";
// 注意:本模块会被 content-worker.ts 打进 Worker 子包,Vite 的 worker 构建不解析
// tsconfig 的 ~/ 别名,依赖链里一律用相对路径引入
import { GrammarLessonSchema, ListeningItemSchema, ReadingArticleSchema, VocabWordSchema } from "../api/schemas";

// 静态内容 zod 契约注册表:主线程(content.ts)与内容 Worker(content-worker.ts)共用,
// 每个 kind 对应一种 public/data JSON 文件形状;新增内容类型在此登记一处即可。

const cefr = z.enum(["A1", "A2", "B1", "B2"]);
const stage3 = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const GrammarMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string(),
  level: cefr,
  stage: stage3,
  questionCount: z.number().int().positive(),
  part: z.number().int().positive(),
});
const ReadingMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string(),
  level: cefr,
  stage: z.union([z.literal(2), z.literal(3)]),
  wordCount: z.number().int().positive(),
  questionCount: z.number().int().positive(),
  part: z.number().int().positive(),
});
const ListeningMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  topic: z.string().min(1),
  summary: z.string(),
  level: cefr,
  stage: stage3,
  type: z.enum(["dialogue", "monologue"]),
  sentenceCount: z.number().int().positive(),
  questionCount: z.number().int().positive(),
  part: z.number().int().positive(),
});

function indexSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    total: z.number().int(),
    parts: z.number().int(),
    /** meta 分片数:1 = items 内联在 index.json;>1 = items 为空,meta 在 index-part-XX.json */
    indexParts: z.number().int().positive(),
    items: z.array(item),
  });
}

/** 词库分片清单头(vocab/stageN/manifest.json) */
const VocabManifestSchema = z.object({ total: z.number().int(), parts: z.number().int().positive() });

export const CONTENT_SCHEMAS = {
  vocabManifest: VocabManifestSchema,
  vocabWords: z.array(VocabWordSchema),
  grammarIndex: indexSchema(GrammarMetaSchema),
  grammarMetas: z.array(GrammarMetaSchema),
  grammarLessons: z.array(GrammarLessonSchema),
  readingIndex: indexSchema(ReadingMetaSchema),
  readingMetas: z.array(ReadingMetaSchema),
  readingArticles: z.array(ReadingArticleSchema),
  listeningIndex: indexSchema(ListeningMetaSchema),
  listeningMetas: z.array(ListeningMetaSchema),
  listeningItems: z.array(ListeningItemSchema),
} as const;

export type ContentKind = keyof typeof CONTENT_SCHEMAS;

/** index.json 的形状(与 indexSchema 对应;loadIndexDir 泛型读取用) */
export interface IndexShape<T> {
  total: number;
  parts: number;
  indexParts: number;
  items: T[];
}
