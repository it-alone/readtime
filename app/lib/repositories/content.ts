import type {
  ContentRepository,
  GrammarLessonMeta,
  ListeningItemMeta,
  ReadingArticleMeta,
} from "~/lib/repositories/types";
import type { GrammarLesson, ListeningItem, ReadingArticle, Stage, VocabWord } from "~/models/types";
import { type ContentKind, type IndexShape } from "./content-schemas";
import { fetchParsed } from "./content-worker-client";

// 静态内容仓储:public/data 分级 JSON 懒加载 + zod 校验 + 内存缓存(见 §7.1)。
// 语法/阅读/听力内容量大(3000+ 条/模块),构建期按 §11 预算切分(单文件 ≤ 500KB):
//   part-XX.json 全量数据(字节优先 450KB / 条数封顶)+ index.json 轻量 meta
//   (meta 过大时再拆 index-part-XX.json):列表页只拉索引,详情页按 meta.part 定位单片。
// 词库每 stage 同样拆成 vocab/stageN/(manifest + part-XX),整 stage 顺序加载。
// fetch+解析+校验经 content-worker-client 交给后台 Worker,主线程不再被 MB 级 JSON 卡住。
// BASE_URL:子路径部署(GitHub Pages /readtime/)下内容也在子路径下。

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

const partFile = (part: number) => `part-${String(part).padStart(2, "0")}.json`;

/** 阅读 id(r2-xxx/r3-xxx)→ 分片目录名;非阅读 id 返回 undefined */
function readingStageOf(id: string): 2 | 3 | undefined {
  if (id.startsWith("r2-")) return 2;
  if (id.startsWith("r3-")) return 3;
  return undefined;
}

export class StaticContentRepository implements ContentRepository {
  private vocabCache = new Map<Stage, VocabWord[]>();
  private grammarIndex: GrammarLessonMeta[] | null = null;
  private grammarParts = new Map<number, GrammarLesson[]>();
  private readingIndexes = new Map<2 | 3, ReadingArticleMeta[]>();
  private readingParts = new Map<string, ReadingArticle[]>();
  private listeningIndex: ListeningItemMeta[] | null = null;
  private listeningParts = new Map<number, ListeningItem[]>();

  async loadStage(stage: Stage): Promise<VocabWord[]> {
    const hit = this.vocabCache.get(stage);
    if (hit) return hit;
    const dir = `${DATA_BASE}vocab/stage${stage}`;
    const manifest = await fetchParsed(`${dir}/manifest.json`, "vocabManifest", `词库清单(stage${stage})`);
    const parts = await Promise.all(
      Array.from({ length: manifest.parts }, (_, i) =>
        fetchParsed(`${dir}/${partFile(i + 1)}`, "vocabWords", `词库(stage${stage})`),
      ),
    );
    const words = parts.flat();
    this.vocabCache.set(stage, words);
    return words;
  }

  /** 加载分片索引:index.json 内联 items 时直接用,否则并行拉全部 index-part-XX.json */
  private async loadIndexDir<M>(
    dir: string,
    label: string,
    indexKind: ContentKind,
    metaKind: ContentKind,
  ): Promise<M[]> {
    // kind 与 M 的对应关系由调用点固定(如 "grammarIndex" → GrammarLessonMeta),注册表已保证形状
    const idx = (await fetchParsed(`${dir}/index.json`, indexKind, label)) as IndexShape<M>;
    if (idx.indexParts <= 1) return idx.items;
    const parts = await Promise.all(
      Array.from({ length: idx.indexParts }, (_, i) =>
        fetchParsed(`${dir}/index-part-${String(i + 1).padStart(2, "0")}.json`, metaKind, `${label}分片`) as Promise<M[]>,
      ),
    );
    return parts.flat();
  }

  async loadGrammarIndex(): Promise<GrammarLessonMeta[]> {
    if (this.grammarIndex) return this.grammarIndex;
    this.grammarIndex = await this.loadIndexDir<GrammarLessonMeta>(
      `${DATA_BASE}grammar`,
      "语法课程索引",
      "grammarIndex",
      "grammarMetas",
    );
    return this.grammarIndex;
  }

  private async grammarPart(part: number): Promise<GrammarLesson[]> {
    const hit = this.grammarParts.get(part);
    if (hit) return hit;
    const items = await fetchParsed(`${DATA_BASE}grammar/${partFile(part)}`, "grammarLessons", "语法课程");
    this.grammarParts.set(part, items);
    return items;
  }

  async getGrammarLesson(id: string): Promise<GrammarLesson | undefined> {
    const meta = (await this.loadGrammarIndex()).find((m) => m.id === id);
    if (!meta) return undefined;
    return (await this.grammarPart(meta.part)).find((l) => l.id === id);
  }

  private async readingIndex(stage: 2 | 3): Promise<ReadingArticleMeta[]> {
    const hit = this.readingIndexes.get(stage);
    if (hit) return hit;
    const items = await this.loadIndexDir<ReadingArticleMeta>(
      `${DATA_BASE}reading/l${stage}`,
      `阅读素材索引(l${stage})`,
      "readingIndex",
      "readingMetas",
    );
    this.readingIndexes.set(stage, items);
    return items;
  }

  async loadReadingIndex(): Promise<ReadingArticleMeta[]> {
    const [l2, l3] = await Promise.all([this.readingIndex(2), this.readingIndex(3)]);
    // l2 在前:l2-001…→l3-001…,与"先场景后长文"的学习顺序一致
    return [...l2, ...l3];
  }

  private async readingPart(stage: 2 | 3, part: number): Promise<ReadingArticle[]> {
    const key = `${stage}:${part}`;
    const hit = this.readingParts.get(key);
    if (hit) return hit;
    const items = await fetchParsed(
      `${DATA_BASE}reading/l${stage}/${partFile(part)}`,
      "readingArticles",
      "阅读素材",
    );
    this.readingParts.set(key, items);
    return items;
  }

  async getReadingArticle(id: string): Promise<ReadingArticle | undefined> {
    const stage = readingStageOf(id);
    if (!stage) return undefined;
    const meta = (await this.readingIndex(stage)).find((m) => m.id === id);
    if (!meta) return undefined;
    const part = await this.readingPart(stage, meta.part);
    return part.find((a) => a.id === id);
  }

  async getReadingArticlesByIds(ids: string[]): Promise<ReadingArticle[]> {
    if (ids.length === 0) return [];
    const wanted = new Set(ids);
    // 按阶段把 id 分组 → 各自的索引里查 part → 只拉命中的分片
    const partsToLoad = new Map<2 | 3, Set<number>>();
    for (const stage of [2, 3] as const) {
      const index = await this.readingIndex(stage);
      for (const meta of index) {
        if (wanted.has(meta.id)) {
          const set = partsToLoad.get(stage) ?? new Set<number>();
          set.add(meta.part);
          partsToLoad.set(stage, set);
        }
      }
    }
    const found: ReadingArticle[] = [];
    for (const [stage, parts] of partsToLoad) {
      const articles = await Promise.all([...parts].map((p) => this.readingPart(stage, p)));
      for (const article of articles.flat()) {
        if (wanted.has(article.id)) found.push(article);
      }
    }
    return found;
  }

  async loadListeningIndex(): Promise<ListeningItemMeta[]> {
    if (this.listeningIndex) return this.listeningIndex;
    this.listeningIndex = await this.loadIndexDir<ListeningItemMeta>(
      `${DATA_BASE}listening`,
      "听力素材索引",
      "listeningIndex",
      "listeningMetas",
    );
    return this.listeningIndex;
  }

  private async listeningPart(part: number): Promise<ListeningItem[]> {
    const hit = this.listeningParts.get(part);
    if (hit) return hit;
    const items = await fetchParsed(`${DATA_BASE}listening/${partFile(part)}`, "listeningItems", "听力素材");
    this.listeningParts.set(part, items);
    return items;
  }

  async getListeningItem(id: string): Promise<ListeningItem | undefined> {
    const meta = (await this.loadListeningIndex()).find((m) => m.id === id);
    if (!meta) return undefined;
    return (await this.listeningPart(meta.part)).find((i) => i.id === id);
  }
}
