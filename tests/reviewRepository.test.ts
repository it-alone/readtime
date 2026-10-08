import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "~/lib/storage/db";
import {
  IdbReviewRepository,
  IdbSessionRepository,
  persistCompletion,
  persistWordSeed,
} from "~/lib/repositories/idb-repositories";
import { createDefaultLog, createDefaultProgress } from "~/models/defaults";
import { createSm2Scheduler } from "~/lib/srs/sm2";
import { makeOutboxEntry } from "~/lib/outbox/outbox";

const repo = new IdbReviewRepository();
const sessionRepo = new IdbSessionRepository();
const srs = createSm2Scheduler();
const NOW = new Date("2026-09-29T10:00:00");

function state(wordId: string, dueInDays: number) {
  const base = srs.init(wordId, NOW);
  return { ...base, dueDate: new Date(NOW.getTime() + dueInDays * 86_400_000).toISOString() };
}

beforeEach(async () => {
  const db = await getDb();
  await db.clear("reviewStates");
  await db.clear("dailyLogs");
  await db.clear("progress");
  await db.clear("sessions");
  await db.clear("outbox");
});

describe("IdbReviewRepository", () => {
  it("getDue 仅返回到期项并按到期时间升序", async () => {
    await repo.upsertMany([
      state("w-1", 1),   // 明天到期,不算
      state("w-2", -3),  // 3 天前到期
      state("w-3", -1),  // 昨天到期
      state("w-4", 0),   // 刚好到期
    ]);
    const due = await repo.getDue(NOW);
    // 按到期时间升序:最逾期(w-2,3 天前)优先
    expect(due.map((s) => s.wordId)).toEqual(["w-2", "w-3", "w-4"]);
  });

  it("getDue 支持 limit 截断", async () => {
    await repo.upsertMany([state("w-1", -1), state("w-2", -2), state("w-3", -3)]);
    expect(await repo.getDue(NOW, 2)).toHaveLength(2);
  });

  it("getMany 返回已存在的记录", async () => {
    await repo.upsertMany([state("w-1", -1)]);
    const found = await repo.getMany(["w-1", "w-not-exist"]);
    expect(found.map((s) => s.wordId)).toEqual(["w-1"]);
  });

  it("count 统计学习过的单词数", async () => {
    await repo.upsertMany([state("w-1", -1), state("w-2", -1)]);
    expect(await repo.count()).toBe(2);
  });

  it("getWeakest 按 lapses 降序、EF 升序,过滤零遗忘词", async () => {
    const many = srs.init("w-many", NOW);
    const few = srs.init("w-few", NOW);
    const lowEf = srs.init("w-low-ef", NOW);
    await repo.upsertMany([
      state("w-clean", -1), // 未遗忘,不应出现
      { ...many, lapses: 5, easeFactor: 2.5 },
      { ...few, lapses: 2, easeFactor: 2.3 },
      { ...lowEf, lapses: 2, easeFactor: 1.8 }, // 同 lapses,EF 更低排前
    ]);
    const weakest = await repo.getWeakest(3);
    expect(weakest.map((s) => s.wordId)).toEqual(["w-many", "w-low-ef", "w-few"]);
  });
});

describe("persistCompletion 原子事务", () => {
  it("复习状态/日志/进度/会话/Outbox 五 store 同事务落盘", async () => {
    const progress = createDefaultProgress(NOW);
    await persistCompletion({
      states: [srs.schedule(srs.init("w-1", NOW), 5, NOW)],
      log: { ...createDefaultLog("2026-09-29"), newWordsLearned: 1, xp: 30 },
      progress: { ...progress, xp: 30 },
      session: {
        id: "session-1",
        type: "vocab",
        startedAt: NOW.toISOString(),
        endedAt: NOW.toISOString(),
        items: [{ wordId: "w-1", kind: "new", grade: 5, elapsedMs: 1200 }],
        xpEarned: 30,
      },
      entry: makeOutboxEntry("vocab-session", { foo: 1 }, NOW),
    });

    expect(await repo.count()).toBe(1);
    const db = await getDb();
    const logs = await db.getAll("dailyLogs");
    expect(logs).toHaveLength(1);
    expect(logs[0].newWordsLearned).toBe(1);
    const sessions = await db.getAll("sessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].items).toHaveLength(1);
    const outbox = await db.getAll("outbox");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("vocab-session");
  });
});

describe("IdbSessionRepository.since", () => {
  async function putSession(id: string, startedAt: string): Promise<void> {
    const db = await getDb();
    await db.put("sessions", {
      id,
      type: "vocab",
      startedAt,
      endedAt: startedAt,
      items: [],
      xpEarned: 10,
    });
  }

  it("仅返回 startedAt >= cutoff 的会话,按时间升序", async () => {
    const cutoff = "2026-09-22T10:00:00.000Z";
    await putSession("s-old", "2026-09-21T23:00:00.000Z");
    await putSession("s-edge", "2026-09-22T10:00:00.000Z");
    await putSession("s-new", "2026-09-28T08:00:00.000Z");
    const found = await sessionRepo.since(cutoff);
    expect(found.map((s) => s.id)).toEqual(["s-edge", "s-new"]);
  });

  it("没有匹配时返回空数组", async () => {
    await putSession("s-old", "2026-09-01T00:00:00.000Z");
    expect(await sessionRepo.since("2026-09-22T10:00:00.000Z")).toEqual([]);
  });
});

describe("persistWordSeed 生词入库(阅读标注)", () => {
  it("只写复习状态 + Outbox,不动日志/会话,次日到期", async () => {
    const seeded = srs.schedule(srs.init("w-seed", NOW), 5, NOW);
    await persistWordSeed(seeded, makeOutboxEntry("word-seed", { wordId: "w-seed" }, NOW));

    const stored = await repo.getMany(["w-seed"]);
    expect(stored).toHaveLength(1);
    // 按答对计:1 天后到期,EF 略升,repetitions=1
    expect(stored[0].intervalDays).toBe(1);
    expect(stored[0].repetitions).toBe(1);
    expect(Date.parse(stored[0].dueDate)).toBe(NOW.getTime() + 86_400_000);

    const db = await getDb();
    expect(await db.getAll("dailyLogs")).toHaveLength(0);
    expect(await db.getAll("sessions")).toHaveLength(0);
    const outbox = await db.getAll("outbox");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].type).toBe("word-seed");
  });
});
