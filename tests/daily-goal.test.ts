import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { getServices } from "~/lib/api/local";
import { getDb } from "~/lib/storage/db";
import { retentionSamples } from "~/lib/diagnosis/retention";
import type { ItemResult, LearningSession } from "~/models/types";

// 当日新词目标的口径回归(用户报告:无论学多少,学习/复习进度都不对):
// 1. 留存率低迷减半的是「当日目标」且只依据今日之前的历史 → 学完即止,不再冒题
// 2. 当天答得差不追加压缩当天目标(冻结到历史)
// 3. 首页今日环的"复习已清"只认词汇主线,听力/拼写练习不虚增

const PUBLIC_ROOT = new URL("../public", import.meta.url).pathname;
const DAY = 86_400_000;
const TODAY = new Date("2026-11-12T09:00:00");
const YESTERDAY = new Date(TODAY.getTime() - DAY);

/** 内容仓库经 fetch 拉 public/data;Node 测试环境下用文件系统兜底 */
function mockContentFetch(): void {
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as { fetch: unknown }).fetch = (async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const rel = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/data\//, "data/");
    const body = JSON.parse(readFileSync(`${PUBLIC_ROOT}/${rel}`, "utf8"));
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
}

/** 昨天的低留存历史:两场词汇会话,共 12 道复习题全错 */
function poorHistorySession(id: string, hour: number): LearningSession {
  const started = new Date(YESTERDAY.getTime() + hour * 3_600_000);
  return {
    id,
    type: "vocab",
    startedAt: started.toISOString(),
    endedAt: new Date(started.getTime() + 5 * 60000).toISOString(),
    items: Array.from({ length: 6 }, (_, i) => ({
      wordId: `hist-${id}-${i}`,
      kind: "review" as const,
      grade: 2,
      elapsedMs: 3000,
    })),
    xpEarned: 10,
  };
}

function vocabResults(
  items: { word: { id: string }; kind: string }[],
  correct: boolean,
): ItemResult[] {
  return items.map((it) => ({
    wordId: it.word.id,
    kind: it.kind as ItemResult["kind"],
    grade: correct ? 5 : 2,
    correct,
    elapsedMs: 3000,
  }));
}

beforeEach(async () => {
  mockContentFetch();
  const db = await getDb();
  for (const s of ["reviewStates", "dailyLogs", "progress", "sessions", "outbox"] as const) {
    await db.clear(s);
  }
});

describe("当日新词目标口径", () => {
  it("留存率低迷:目标减半为 5,学完即止,再取任务不再冒新题", async () => {
    const services = getServices();

    // 写入昨天的低留存历史(12 道复习题全错 → 留存率 0)
    const db = await getDb();
    for (const s of [poorHistorySession("h1", 9), poorHistorySession("h2", 10)]) {
      await db.put("sessions", s);
    }

    // 今晨首取:目标减半 10→5
    const morning = await services.vocab.getTodayTask(TODAY);
    expect(morning.items.filter((i) => i.kind === "new")).toHaveLength(5);

    // 学完这 5 词(全答对)
    await services.vocab.completeSession(
      vocabResults(morning.items.filter((i) => i.kind === "new"), true),
      new Date(TODAY.getTime() - 5 * 60000),
      TODAY,
    );

    // 再取任务:不再出新词(回归:旧逻辑会再发 ceil((10-5)/2)=3 词,目标永远追不满)
    const after = await services.vocab.getTodayTask(TODAY);
    expect(after.items.filter((i) => i.kind === "new")).toHaveLength(0);
    expect(after.goal.newTarget).toBe(0);
    // 首页分母 = 已学 5 + 剩余 0 = 5,整天稳定
    expect(after.goal.newDone).toBe(5);
  });

  it("当天答得很差不追加压缩当日目标(留存率冻结到昨日历史)", async () => {
    const services = getServices();
    const db = await getDb();
    for (const s of [poorHistorySession("h1", 9), poorHistorySession("h2", 10)]) {
      await db.put("sessions", s);
    }

    // 早上取任务 → 目标 5;先完成今天第一场(全错,把当日留存率打到 0)
    const morning = await services.vocab.getTodayTask(TODAY);
    const newItems = morning.items.filter((i) => i.kind === "new");
    await services.vocab.completeSession(
      vocabResults(newItems, false),
      new Date(TODAY.getTime() - 5 * 60000),
      TODAY,
    );

    // 再取任务:当日目标仍是 5(减半一次),剩余 = 5 - 已学,不会因今天的错题进一步缩水
    const after = await services.vocab.getTodayTask(TODAY);
    expect(after.goal.newDone).toBe(newItems.length);
    expect(after.goal.newDone + after.goal.newTarget).toBe(5);
  });

  it("首页今日环:听力/拼写练习不计入词汇主线的复习已清数", async () => {
    const services = getServices();
    const db = await getDb();
    // 昨天学 10 词(为听力练习提供素材)
    const yesterdayTask = await services.vocab.getTodayTask(YESTERDAY);
    await services.vocab.completeSession(
      vocabResults(yesterdayTask.items, true),
      new Date(YESTERDAY.getTime() - 6 * 60000),
      YESTERDAY,
    );

    // 今天:一场词汇复习(2 题)+ 一场听力练习(10 题)
    const todayTask = await services.vocab.getTodayTask(TODAY);
    const reviewItems = todayTask.items.filter((i) => i.kind === "review");
    if (reviewItems.length > 0) {
      await services.vocab.completeSession(
        vocabResults(reviewItems.slice(0, 2), true),
        new Date(TODAY.getTime() - 5 * 60000),
        TODAY,
      );
    }
    const listen = await services.vocab.buildListeningPractice(TODAY);
    await services.vocab.completeListeningSession(
      vocabResults(listen.task.items, true),
      new Date(TODAY.getTime() - 4 * 60000),
      TODAY,
    );

    // 首页口径:今日环的"复习已清"只数词汇会话的复习题
    const dayStart = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate()).toISOString();
    const todaySessions = await services.sessions.since(dayStart);
    const cleared = retentionSamples(todaySessions.filter((s) => s.type === "vocab"));
    expect(todaySessions.some((s) => s.type === "listening-dictation")).toBe(true);
    expect(cleared).toBe(Math.min(2, reviewItems.length));
  });
});
