import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GrammarLessonSchema,
  ListeningItemSchema,
  ReadingArticleSchema,
  VocabWordSchema,
} from "~/lib/api/schemas";

// 内容管线校验(ARCHITECTURE.md §7.4 内容即数据):
// public/data 下的静态内容必须通过 zod 契约,再进入构建产物。
// 分片按 §11 性能预算切分(单文件 ≤ 500KB):part-XX.json 全量数据、
// index.json 轻量 meta(meta 过大再拆 index-part-XX)、词库 manifest + part-XX。
// 先验索引与分片的自洽,再验内容契约,最后逐文件卡 500KB 预算。
// 新增内容或扩词库时,此测试是第一道卡口。

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf-8"));
}

interface ChunkMeta {
  id: string;
  part: number;
}
interface ChunkIndex<T extends ChunkMeta> {
  total: number;
  parts: number;
  indexParts: number;
  items: T[];
}

const partFile = (p: number) => `part-${String(p).padStart(2, "0")}.json`;

/** 载入分片模块:index.json(+ 可选 index-part-XX)+ 全部 part-XX.json,返回合并后的全量条目 */
function loadChunked<T extends ChunkMeta, U extends { id: string }>(
  dirRel: string,
  label: string,
): { index: ChunkIndex<T>; items: U[] } {
  const index = loadJson(`${dirRel}/index.json`) as ChunkIndex<T>;
  const metas: T[] =
    index.indexParts <= 1
      ? index.items
      : Array.from({ length: index.indexParts }, (_, i) =>
          loadJson(`${dirRel}/index-part-${String(i + 1).padStart(2, "0")}.json`) as T[],
        ).flat();
  const partArrays: U[][] = [];
  for (let p = 1; p <= index.parts; p++) {
    partArrays.push(loadJson(`${dirRel}/${partFile(p)}`) as U[]);
  }
  const parts = partArrays.flat();
  expect(parts.length, `${label} index.total 应与合并条目数一致`).toBe(index.total);
  expect(metas.length, `${label} 索引 meta 应与合并条目数一致`).toBe(index.total);
  expect(metas.map((m) => m.id), `${label} 索引顺序应与分片拼接顺序一致`).toEqual(parts.map((p) => p.id));
  // part 字段指向正确分片:每个分片文件里的 id 集合 = 索引中声明该 part 的 id 集合
  const claimedByPart = new Map<number, string[]>();
  metas.forEach((meta) => {
    expect(meta.part, `${label} ${meta.id} 的 part 字段`).toBeGreaterThanOrEqual(1);
    expect(meta.part, `${label} ${meta.id} 的 part 字段`).toBeLessThanOrEqual(index.parts);
    claimedByPart.set(meta.part, [...(claimedByPart.get(meta.part) ?? []), meta.id]);
  });
  partArrays.forEach((chunk, p) => {
    expect(
      [...chunk.map((c) => c.id)].sort(),
      `${label} ${partFile(p + 1)} 的条目应与索引声明的 part=${p + 1} 一致`,
    ).toEqual([...(claimedByPart.get(p + 1) ?? [])].sort());
  });
  return { index, items: parts };
}

/** 载入词库某 stage:manifest.json + 全部 part-XX.json 顺序合并 */
function loadVocabStage(stage: 1 | 2 | 3): unknown[] {
  const dir = `../public/data/vocab/stage${stage}`;
  const manifest = loadJson(`${dir}/manifest.json`) as { total: number; parts: number };
  const words: unknown[] = [];
  for (let p = 1; p <= manifest.parts; p++) {
    words.push(...(loadJson(`${dir}/${partFile(p)}`) as unknown[]));
  }
  expect(words.length, `词库 stage${stage} manifest.total 应与合并条目数一致`).toBe(manifest.total);
  return words;
}

const stage1 = loadVocabStage(1);
const stage2 = loadVocabStage(2);
const stage3 = loadVocabStage(3);
const grammar = loadChunked<ChunkMeta, ReturnType<typeof GrammarLessonSchema.parse>>(
  "../public/data/grammar",
  "语法",
);
const readingL2 = loadChunked<ChunkMeta, ReturnType<typeof ReadingArticleSchema.parse>>(
  "../public/data/reading/l2",
  "阅读 l2",
);
const readingL3 = loadChunked<ChunkMeta, ReturnType<typeof ReadingArticleSchema.parse>>(
  "../public/data/reading/l3",
  "阅读 l3",
);
const listening = loadChunked<ChunkMeta, ReturnType<typeof ListeningItemSchema.parse>>(
  "../public/data/listening",
  "听力",
);
const articles = readingL2.items;
const articlesL3 = readingL3.items;
const lessons = grammar.items;
const listeningLibrary = listening.items;

describe("词库内容契约", () => {
  it("stage1(manifest + part 分片)通过 VocabWordSchema 校验", () => {
    expect(() => VocabWordSchema.array().parse(stage1)).not.toThrow();
  });

  it("stage2 分片通过 VocabWordSchema 校验", () => {
    expect(() => VocabWordSchema.array().parse(stage2)).not.toThrow();
  });

  it("词量达到第一年目标(3000 词,支持全年每日新词)", () => {
    expect(VocabWordSchema.array().parse(stage1).length).toBeGreaterThanOrEqual(3000);
  });

  it("词量达到第二年目标(3000 词,进阶阶段全年供给)", () => {
    expect(VocabWordSchema.array().parse(stage2).length).toBeGreaterThanOrEqual(3000);
  });

  it("id 与 term 均唯一,stage 与文件一致", () => {
    const w1 = VocabWordSchema.array().parse(stage1);
    expect(new Set(w1.map((w) => w.id)).size).toBe(w1.length);
    expect(new Set(w1.map((w) => w.term.toLowerCase())).size).toBe(w1.length);
    expect(w1.every((w) => w.stage === 1)).toBe(true);

    const w2 = VocabWordSchema.array().parse(stage2);
    expect(new Set(w2.map((w) => w.id)).size).toBe(w2.length);
    expect(new Set(w2.map((w) => w.term.toLowerCase())).size).toBe(w2.length);
    expect(w2.every((w) => w.stage === 2)).toBe(true);
  });

  it("stage1 与 stage2 词项不重复(跨 stage 查重)", () => {
    const w1 = VocabWordSchema.array().parse(stage1).map((w) => w.term.toLowerCase());
    const w2 = VocabWordSchema.array().parse(stage2).map((w) => w.term.toLowerCase());
    const overlap = w2.filter((t) => new Set(w1).has(t));
    expect(overlap).toEqual([]);
  });

  it("stage2 id 以 w-s2- 前缀连续编号(词库指针依赖顺序推进)", () => {
    const w2 = VocabWordSchema.array().parse(stage2);
    w2.forEach((w, i) => {
      expect(w.id).toBe(`w-s2-${String(i + 1).padStart(3, "0")}`);
    });
  });

  it("stage3 分片通过 VocabWordSchema 校验且词量达到第三年目标(4000 词,6,000 → 10,000)", () => {
    const w3 = VocabWordSchema.array().parse(stage3);
    expect(w3.length).toBeGreaterThanOrEqual(4000);
  });

  it("stage3 id 与 term 唯一,stage 恒为 3,id 以 w-s3- 前缀连续编号", () => {
    const w3 = VocabWordSchema.array().parse(stage3);
    expect(new Set(w3.map((w) => w.id)).size).toBe(w3.length);
    expect(new Set(w3.map((w) => w.term.toLowerCase())).size).toBe(w3.length);
    expect(w3.every((w) => w.stage === 3)).toBe(true);
    w3.forEach((w, i) => {
      expect(w.id).toBe(`w-s3-${String(i + 1).padStart(3, "0")}`);
    });
  });

  it("stage3 与 stage1/stage2 词项均不重复(跨 stage 查重)", () => {
    const prior = new Set([
      ...VocabWordSchema.array().parse(stage1).map((w) => w.term.toLowerCase()),
      ...VocabWordSchema.array().parse(stage2).map((w) => w.term.toLowerCase()),
    ]);
    const overlap = VocabWordSchema.array()
      .parse(stage3)
      .filter((w) => prior.has(w.term.toLowerCase()))
      .map((w) => w.term);
    expect(overlap).toEqual([]);
  });

  it("全部 stage 词库覆盖所有阅读生词(glossary 入库校验,l2 + l3)", () => {
    const vocab = new Set([
      ...VocabWordSchema.array().parse(stage1).map((w) => w.term.toLowerCase()),
      ...VocabWordSchema.array().parse(stage2).map((w) => w.term.toLowerCase()),
      ...VocabWordSchema.array().parse(stage3).map((w) => w.term.toLowerCase()),
    ]);
    const missing = [articles, articlesL3].flatMap((group) =>
      group.flatMap((a) => a.glossary.filter((g) => !vocab.has(g.term.toLowerCase())).map((g) => `${a.id}:${g.term}`))
    );
    expect(missing).toEqual([]);
  });

  it("id 编号连续且与数组顺序一致(词库指针依赖顺序推进)", () => {
    const words = VocabWordSchema.array().parse(stage1);
    words.forEach((w, i) => {
      expect(w.id).toBe(`w-s1-${String(i + 1).padStart(3, "0")}`);
    });
  });

  it("每词至少 1 条中英例句,音标不为空", () => {
    const words = VocabWordSchema.array().parse(stage1);
    for (const w of words) {
      expect(w.examples.length).toBeGreaterThanOrEqual(1);
      expect(w.examples[0].en.trim().length).toBeGreaterThan(0);
      expect(w.examples[0].zh.trim().length).toBeGreaterThan(0);
      expect(w.phonetic.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("分片产物自洽(index/index-part + part-XX)", () => {
  it("语法/阅读/听力:index 顺序 = 分片拼接顺序,part 字段与实际分片一致(见 loadChunked 内置校验)", () => {
    expect(grammar.index.total).toBe(lessons.length);
    expect(readingL2.index.total).toBe(articles.length);
    expect(readingL3.index.total).toBe(articlesL3.length);
    expect(listening.index.total).toBe(listeningLibrary.length);
  });
});

describe("性能预算(ARCHITECTURE.md §11:public/data 单文件 ≤ 500KB)", () => {
  it("逐文件校验大小,超限即列出清单", () => {
    const oversize: string[] = [];
    const walk = (dir: URL) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const url = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
        if (entry.isDirectory()) walk(url);
        else if (entry.name.endsWith(".json")) {
          const size = statSync(url).size;
          if (size > 500 * 1024) oversize.push(`${entry.name} ${(size / 1024).toFixed(0)}KB`);
        }
      }
    };
    walk(new URL("../public/data/", import.meta.url));
    expect(oversize, `超出 500KB 预算的文件(重新跑 npm run build:content 按字节分片): ${oversize.join(", ")}`).toEqual([]);
  });
});

describe("语法课程内容契约", () => {
  it("全部分片通过 GrammarLessonSchema 校验", () => {
    expect(() => GrammarLessonSchema.array().parse(lessons)).not.toThrow();
  });

  it("课程数达到扩容后规模(3426 课 = 每 stage 1100+ 课,全量供给三年)", () => {
    expect(lessons.length).toBeGreaterThanOrEqual(3300);
    expect(lessons.filter((l) => l.stage === 1).length).toBeGreaterThanOrEqual(1100);
    expect(lessons.filter((l) => l.stage === 2).length).toBeGreaterThanOrEqual(1100);
    expect(lessons.filter((l) => l.stage === 3).length).toBeGreaterThanOrEqual(1100);
  });

  it("课程 id 前缀与 stage 一致(g-1xx…→1,g-2xx…→2,g-3xx…→3)", () => {
    for (const l of lessons) {
      expect(l.id).toMatch(new RegExp(`^g-${l.stage}\\d{2,5}$`));
    }
  });

  it("课程 id / 题目 id 全局唯一", () => {
    expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
    const qIds = lessons.flatMap((l) => l.questions.map((q) => q.id));
    expect(new Set(qIds).size).toBe(qIds.length);
  });

  it("每课 6 题,answerIndex 落在选项范围内且选项唯一", () => {
    for (const l of lessons) {
      expect(l.questions).toHaveLength(6);
      for (const q of l.questions) {
        expect(q.answerIndex).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options[q.answerIndex].trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("阅读素材内容契约", () => {
  it("全部分片通过 ReadingArticleSchema 校验", () => {
    expect(() => ReadingArticleSchema.array().parse(articles)).not.toThrow();
  });

  it("文章 id / 题目 id 全局唯一,stage 恒为 2,id 形如 r2-XX…", () => {
    expect(new Set(articles.map((a) => a.id)).size).toBe(articles.length);
    const qIds = articles.flatMap((a) => a.questions.map((q) => q.id));
    expect(new Set(qIds).size).toBe(qIds.length);
    expect(articles.every((a) => a.stage === 2)).toBe(true);
    for (const a of articles) {
      expect(a.id).toMatch(/^r2-\d{2,4}$/);
    }
  });

  it("文章数达到扩容后规模(3300 篇 = A1 ≥ 800 + A2 ≥ 1200 + B1 ≥ 1200),场景文章覆盖 8 大场景", () => {
    expect(articles.length).toBeGreaterThanOrEqual(3200);
    expect(articles.filter((a) => a.level === "A1").length).toBeGreaterThanOrEqual(800);
    expect(articles.filter((a) => a.level === "A2").length).toBeGreaterThanOrEqual(1200);
    expect(articles.filter((a) => a.level === "B1").length).toBeGreaterThanOrEqual(1200);
    const topics = new Set(articles.map((a) => a.topic));
    for (const t of ["校园生活", "职场工作", "旅行出行", "购物消费", "健康生活", "社交生活", "媒体网络", "生活服务"]) {
      expect(topics.has(t), `缺少场景:${t}`).toBe(true);
    }
  });

  it("每篇有正文段落、词汇表,wordCount 与段落一致,题目 3–8 道且答案合法", () => {
    for (const a of articles) {
      expect(a.paragraphs.length).toBeGreaterThanOrEqual(1);
      expect(a.glossary.length).toBeGreaterThanOrEqual(1);
      expect(a.wordCount).toBe(a.paragraphs.join(" ").split(/\s+/).filter(Boolean).length);
      expect(a.questions.length).toBeGreaterThanOrEqual(3);
      expect(a.questions.length).toBeLessThanOrEqual(8);
      for (const q of a.questions) {
        expect(q.answerIndex).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });
});

describe("第三年 B2 深度阅读契约(l3)", () => {
  it("全部分片通过 ReadingArticleSchema 校验,id 唯一且 stage 恒为 3", () => {
    const parsed = ReadingArticleSchema.array().parse(articlesL3);
    expect(new Set(parsed.map((a) => a.id)).size).toBe(parsed.length);
    const qIds = parsed.flatMap((a) => a.questions.map((q) => q.id));
    expect(new Set(qIds).size).toBe(qIds.length);
    expect(parsed.every((a) => a.stage === 3)).toBe(true);
    for (const a of parsed) {
      expect(a.id).toMatch(/^r3-\d{2,4}$/);
    }
  });

  it("B2 深度文章达到规模目标(116 篇 = 原 16 篇 + 新增 100 篇,16 大场景均衡,每篇 ≥ 700 词)", () => {
    const parsed = ReadingArticleSchema.array().parse(articlesL3);
    expect(parsed.length).toBeGreaterThanOrEqual(116);
    expect(parsed.every((a) => a.level === "B2")).toBe(true);
    const byTopic = new Map<string, number>();
    for (const a of parsed) byTopic.set(a.topic, (byTopic.get(a.topic) ?? 0) + 1);
    // 原 16 篇覆盖 8 大核心场景(各 2),新增 100 篇在 16 个场景间轮转(各 6–7)
    for (const t of ["校园生活", "职场工作", "旅行出行", "购物消费", "健康生活", "社交生活", "媒体网络", "生活服务"]) {
      expect(byTopic.get(t) ?? 0, `核心场景 ${t} 应有足量篇章`).toBeGreaterThanOrEqual(8);
    }
    for (const t of ["家庭生活", "美食烹饪", "运动健身", "自然环境", "城市生活", "兴趣爱好", "节日文化", "科学技术"]) {
      expect(byTopic.get(t) ?? 0, `拓展场景 ${t} 应有篇章`).toBeGreaterThanOrEqual(6);
    }
    for (const a of parsed) {
      expect(a.wordCount, `${a.id} 应为深度长文(≥700 词)`).toBeGreaterThanOrEqual(700);
    }
  });

  it("每篇有正文段落、词汇表与论证/推断类题目,wordCount 与段落一致", () => {
    const parsed = ReadingArticleSchema.array().parse(articlesL3);
    for (const a of parsed) {
      expect(a.paragraphs.length).toBeGreaterThanOrEqual(4);
      expect(a.glossary.length).toBeGreaterThanOrEqual(5);
      expect(a.wordCount).toBe(a.paragraphs.join(" ").split(/\s+/).filter(Boolean).length);
      expect(a.questions.length).toBeGreaterThanOrEqual(5);
      expect(a.questions.length).toBeLessThanOrEqual(8);
      for (const q of a.questions) {
        expect(q.answerIndex).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });

  it("l2 与 l3 文章 id 不冲突", () => {
    const l2 = articles.map((a) => a.id);
    const l3 = articlesL3.map((a) => a.id);
    expect(l3.filter((id) => new Set(l2).has(id))).toEqual([]);
  });
});

describe("听力素材内容契约", () => {
  it("全部分片通过 ListeningItemSchema 校验", () => {
    expect(() => ListeningItemSchema.array().parse(listeningLibrary)).not.toThrow();
  });

  it("素材达到规模目标(2040 篇 = 第一年 1432 + 第二年 608)", () => {
    expect(listeningLibrary.length).toBeGreaterThanOrEqual(2000);
    expect(listeningLibrary.filter((i) => i.stage === 1).length).toBeGreaterThanOrEqual(1400);
    expect(listeningLibrary.filter((i) => i.stage === 2).length).toBeGreaterThanOrEqual(600);
  });

  it("素材 id / 题目 id 全局唯一,id 与 stage 前缀一致", () => {
    expect(new Set(listeningLibrary.map((i) => i.id)).size).toBe(listeningLibrary.length);
    const qIds = listeningLibrary.flatMap((i) => i.questions.map((q) => q.id));
    expect(new Set(qIds).size).toBe(qIds.length);
    for (const i of listeningLibrary) {
      expect(i.id).toMatch(new RegExp(`^ls${i.stage}-\\d{2,4}$`));
    }
  });

  it("每篇 3–10 句双语文本、3–5 题,answerIndex 合法且选项唯一", () => {
    for (const i of listeningLibrary) {
      expect(i.sentences.length).toBeGreaterThanOrEqual(3);
      expect(i.sentences.length).toBeLessThanOrEqual(10);
      expect(i.questions.length).toBeGreaterThanOrEqual(3);
      expect(i.questions.length).toBeLessThanOrEqual(5);
      for (const q of i.questions) {
        expect(q.answerIndex).toBeLessThan(q.options.length);
        expect(new Set(q.options).size).toBe(q.options.length);
      }
    }
  });
});
