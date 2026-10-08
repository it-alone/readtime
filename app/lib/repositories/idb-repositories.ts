import { getDb, SINGLETON_KEY, type CompletionTx } from "~/lib/storage/db";
import { broadcastSettingsChanged } from "~/lib/storage/broadcast";
import { createDefaultLog, createDefaultProgress, createDefaultSettings } from "~/models/defaults";
import type {
  DailyLog,
  LearningSession,
  OutboxEntry,
  Progress,
  ReviewState,
  Settings,
} from "~/models/types";
import type {
  DailyLogRepository,
  OutboxRepository,
  ProgressRepository,
  ReviewRepository,
  SessionRepository,
  SettingsRepository,
} from "~/lib/repositories/types";

// IndexedDB 实现(见 ARCHITECTURE.md §7.2):
// - 到期队列走 by-due 索引游标(IDBKeyRange 上界),禁止全表扫描
// - 支持外部传入跨 store 事务,保证会话完成的原子落盘

export class IdbReviewRepository implements ReviewRepository {
  async getDue(now: Date, limit = Number.POSITIVE_INFINITY): Promise<ReviewState[]> {
    const db = await getDb();
    const due = await db.getAllFromIndex(
      "reviewStates",
      "by-due",
      IDBKeyRange.upperBound(now.toISOString())
    );
    return due
      .sort((a, b) =>
        a.dueDate === b.dueDate ? b.lapses - a.lapses : a.dueDate < b.dueDate ? -1 : 1
      )
      .slice(0, limit);
  }

  async getMany(wordIds: string[]): Promise<ReviewState[]> {
    const db = await getDb();
    const tx = db.transaction("reviewStates");
    const states = await Promise.all(wordIds.map((id) => tx.store.get(id)));
    return states.filter((s): s is ReviewState => s !== undefined);
  }

  async upsertMany(states: ReviewState[], tx?: CompletionTx): Promise<void> {
    if (tx) {
      await Promise.all(states.map((s) => tx.objectStore("reviewStates").put(s)));
      return;
    }
    const db = await getDb();
    const own = db.transaction("reviewStates", "readwrite");
    await Promise.all(states.map((s) => own.objectStore("reviewStates").put(s)));
    await own.done;
  }

  async count(): Promise<number> {
    const db = await getDb();
    return db.count("reviewStates");
  }

  async getWeakest(limit = 10): Promise<ReviewState[]> {
    const db = await getDb();
    const all = await db.getAll("reviewStates");
    return all
      .filter((s) => s.lapses > 0)
      .sort((a, b) => b.lapses - a.lapses || a.easeFactor - b.easeFactor)
      .slice(0, limit);
  }

  async all(): Promise<ReviewState[]> {
    const db = await getDb();
    const all = await db.getAll("reviewStates");
    return all.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  }
}

export class IdbProgressRepository implements ProgressRepository {
  async get(): Promise<Progress> {
    const db = await getDb();
    const stored = await db.get("progress", SINGLETON_KEY);
    return stored ?? createDefaultProgress(new Date());
  }

  async save(progress: Progress, tx?: CompletionTx): Promise<void> {
    if (tx) {
      await tx.objectStore("progress").put(progress, SINGLETON_KEY);
      return;
    }
    const db = await getDb();
    await db.put("progress", progress, SINGLETON_KEY);
  }
}

export class IdbSettingsRepository implements SettingsRepository {
  async get(): Promise<Settings> {
    const db = await getDb();
    const stored = await db.get("settings", SINGLETON_KEY);
    return stored ?? createDefaultSettings();
  }

  async save(settings: Settings): Promise<void> {
    const db = await getDb();
    await db.put("settings", settings, SINGLETON_KEY);
    // 跨标签页同步:其他标签页收到广播后重取路由数据(ARCHITECTURE.md §4.4)
    broadcastSettingsChanged();
  }
}

export class IdbDailyLogRepository implements DailyLogRepository {
  async get(date: string): Promise<DailyLog> {
    const db = await getDb();
    const stored = await db.get("dailyLogs", date);
    return stored ?? createDefaultLog(date);
  }

  async getAll(): Promise<DailyLog[]> {
    const db = await getDb();
    return db.getAll("dailyLogs");
  }

  async upsert(log: DailyLog, tx?: CompletionTx): Promise<void> {
    if (tx) {
      await tx.objectStore("dailyLogs").put(log);
      return;
    }
    const db = await getDb();
    await db.put("dailyLogs", log);
  }
}

export class IdbSessionRepository implements SessionRepository {
  async recent(limit: number): Promise<LearningSession[]> {
    const db = await getDb();
    const asc = await db.getAllFromIndex("sessions", "by-startedAt");
    return asc.reverse().slice(0, limit);
  }

  async since(cutoff: string): Promise<LearningSession[]> {
    const db = await getDb();
    return db.getAllFromIndex("sessions", "by-startedAt", IDBKeyRange.lowerBound(cutoff));
  }
}

export class IdbOutboxRepository implements OutboxRepository {
  async append(entries: unknown[], tx?: CompletionTx): Promise<void> {
    const outboxEntries = entries as OutboxEntry[];
    if (tx) {
      await Promise.all(outboxEntries.map((e) => tx.objectStore("outbox").put(e)));
      return;
    }
    const db = await getDb();
    const own = db.transaction("outbox", "readwrite");
    await Promise.all(outboxEntries.map((e) => own.objectStore("outbox").put(e)));
    await own.done;
  }

  async getAll(): Promise<unknown[]> {
    const db = await getDb();
    return db.getAll("outbox");
  }
}

export interface CompletionPersistInput {
  states: ReviewState[];
  log: DailyLog;
  progress: Progress;
  session: LearningSession;
  entry: OutboxEntry;
}

/** 会话完成:业务数据(含会话记录)+ Outbox 条目单事务原子落盘 */
export async function persistCompletion(input: CompletionPersistInput): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    ["reviewStates", "dailyLogs", "progress", "sessions", "outbox"],
    "readwrite"
  );
  const reviews = tx.objectStore("reviewStates");
  await Promise.all(input.states.map((s) => reviews.put(s)));
  await tx.objectStore("dailyLogs").put(input.log);
  await tx.objectStore("progress").put(input.progress, SINGLETON_KEY);
  await tx.objectStore("sessions").put(input.session);
  await tx.objectStore("outbox").put(input.entry);
  await tx.done;
}

/** 阅读生词入库:只写 reviewStates + outbox(不构成会话,不动日志/进度/XP) */
export async function persistWordSeed(state: ReviewState, entry: OutboxEntry): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["reviewStates", "outbox"], "readwrite");
  await tx.objectStore("reviewStates").put(state);
  await tx.objectStore("outbox").put(entry);
  await tx.done;
}
