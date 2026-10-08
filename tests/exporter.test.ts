import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, SINGLETON_KEY } from "~/lib/storage/db";
import { exportBundle, importBundle } from "~/lib/storage/exporter";
import { createDefaultLog, createDefaultProgress, createDefaultSettings } from "~/models/defaults";
import type { DailyLog, LearningSession, Progress, Settings } from "~/models/types";

// 导出/导入往返:会话历史必须随包走,旧备份(无 sessions 字段)导入时清空本机会话

const NOW = new Date("2026-09-29T10:00:00");

function seedSession(id: string, type: LearningSession["type"]): LearningSession {
  return {
    id,
    type,
    startedAt: NOW.toISOString(),
    endedAt: new Date(NOW.getTime() + 120_000).toISOString(),
    items: [{ wordId: "w-1", kind: "new", grade: 4, elapsedMs: 3000 }],
    xpEarned: 23,
  };
}

beforeEach(async () => {
  const db = await getDb();
  const stores = ["settings", "progress", "reviewStates", "dailyLogs", "assessments", "sessions", "outbox"] as const;
  for (const store of stores) {
    await db.clear(store);
  }
});

describe("exportBundle / importBundle", () => {
  it("导出包含 sessions 存储,导入后完整还原", async () => {
    const db = await getDb();
    const progress: Progress = { ...createDefaultProgress(NOW), xp: 88 };
    const log: DailyLog = { ...createDefaultLog("2026-09-29"), xp: 51 };
    await db.put("settings", createDefaultSettings(), SINGLETON_KEY);
    await db.put("progress", progress, SINGLETON_KEY);
    await db.put("dailyLogs", log); // keyPath: "date"
    await db.put("sessions", seedSession("s-1", "pron-drill"));
    await db.put("sessions", seedSession("s-2", "reading-quiz"));
    await db.put("reviewStates", {
      wordId: "w-9", easeFactor: 2.4, intervalDays: 1, repetitions: 1,
      dueDate: NOW.toISOString(), lapses: 2, lastReviewedAt: null,
      source: "reading", sourceArticleId: "r2-05",
    });

    const bundle = await exportBundle();
    expect(bundle.data.sessions).toHaveLength(2);
    expect(bundle.data.progress.xp).toBe(88);

    // 模拟迁移到新设备:先写入别的会话,再导入备份覆盖
    await db.put("sessions", seedSession("s-old", "vocab"));
    await importBundle(bundle);
    const restored = await db.getAll("sessions");
    expect(restored.map((s) => s.id).sort()).toEqual(["s-1", "s-2"]);
    // 生词来源(主线/阅读点词)与来源文章随备份往返,弱词榜/复习卡片的"回原文"不丢
    const states = await db.getAll("reviewStates");
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ wordId: "w-9", source: "reading", sourceArticleId: "r2-05" });
    expect((await db.get("progress", SINGLETON_KEY))?.xp).toBe(88);
    expect(await db.get("dailyLogs", "2026-09-29")).toMatchObject({ xp: 51 });
  });

  it("旧备份没有 sessions 字段:导入清空本机会话,其余数据照常写入", async () => {
    const db = await getDb();
    await db.put("sessions", seedSession("s-local", "vocab"));
    await db.put("progress", { ...createDefaultProgress(NOW), xp: 42 }, SINGLETON_KEY);

    const legacy = {
      app: "readtime",
      version: 1,
      exportedAt: NOW.toISOString(),
      data: {
        settings: createDefaultSettings() as Settings,
        progress: { ...createDefaultProgress(NOW), xp: 7 },
        reviewStates: [
          // 旧备份的复习状态没有 source 字段,导入后保持 undefined(视同主线)
          { wordId: "w-old", easeFactor: 2.5, intervalDays: 1, repetitions: 2,
            dueDate: NOW.toISOString(), lapses: 0, lastReviewedAt: null },
        ],
        dailyLogs: [],
        assessments: [],
      },
    };
    await importBundle(legacy);

    expect(await db.getAll("sessions")).toEqual([]);
    const legacyState = (await db.getAll("reviewStates"))[0];
    expect(legacyState.wordId).toBe("w-old");
    expect(legacyState.source).toBeUndefined();
    expect((await db.get("progress", SINGLETON_KEY))?.xp).toBe(7);
  });

  it("畸形数据被 zod 拒绝,本机库不被改动", async () => {
    const db = await getDb();
    await db.put("sessions", seedSession("s-keep", "vocab"));
    await expect(importBundle({ app: "readtime", version: 2 })).rejects.toThrow();
    expect(await db.getAll("sessions")).toHaveLength(1);
  });

  it("导出包含 outbox(离线同步队列),导入覆盖式还原;旧备份无该字段则清空", async () => {
    const db = await getDb();
    await db.put("settings", createDefaultSettings(), SINGLETON_KEY);
    await db.put("progress", createDefaultProgress(NOW), SINGLETON_KEY);
    await db.put("outbox", {
      id: "ob-1", type: "vocab-session", payload: { results: [] },
      createdAt: NOW.toISOString(), attempts: 0,
    });

    const bundle = await exportBundle();
    expect(bundle.data.outbox).toHaveLength(1);

    await db.put("outbox", {
      id: "ob-stale", type: "word-seed", payload: {},
      createdAt: NOW.toISOString(), attempts: 3,
    });
    await importBundle(bundle);
    const restored = await db.getAll("outbox");
    expect(restored.map((e) => e.id)).toEqual(["ob-1"]);

    // 旧备份(无 outbox 字段)导入后,本机旧队列被清空
    const legacy = {
      app: "readtime",
      version: 1,
      exportedAt: NOW.toISOString(),
      data: {
        settings: createDefaultSettings() as Settings,
        progress: createDefaultProgress(NOW),
        reviewStates: [],
        dailyLogs: [],
        assessments: [],
      },
    };
    await importBundle(legacy);
    expect(await db.getAll("outbox")).toEqual([]);
  });
});
