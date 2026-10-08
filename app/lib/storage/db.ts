import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import type {
  AssessmentResult,
  DailyLog,
  LearningSession,
  OutboxEntry,
  Progress,
  ReviewState,
  Settings,
} from "~/models/types";

// IndexedDB 唯一本地存储(ADR-007,见 ARCHITECTURE.md §7.2)
// 库名 readtime;版本迁移走 onupgradeneeded 单向迁移链,保证学习记录不因发版丢失。

export const DB_NAME = "readtime";
export const DB_VERSION = 1;
export const SINGLETON_KEY = "singleton";

interface MetaEntry {
  key: string;
  value: unknown;
}

export interface ReadTimeDB extends DBSchema {
  meta: { key: string; value: MetaEntry };
  settings: { key: string; value: Settings };
  progress: { key: string; value: Progress };
  reviewStates: {
    key: string;
    value: ReviewState;
    indexes: { "by-due": string; "by-lapse": number };
  };
  dailyLogs: { key: string; value: DailyLog };
  sessions: { key: string; value: LearningSession; indexes: { "by-startedAt": string } };
  assessments: { key: string; value: AssessmentResult; indexes: { "by-takenAt": string } };
  outbox: { key: string; value: OutboxEntry; indexes: { "by-createdAt": string } };
}

/** 会话完成时的跨 store 原子事务(业务数据与 Outbox 同事务落盘,见 §7.3) */
export type CompletionTx = IDBPTransaction<
  ReadTimeDB,
  ["reviewStates", "dailyLogs", "progress", "sessions", "outbox"],
  "readwrite"
>;

let dbPromise: Promise<IDBPDatabase<ReadTimeDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<ReadTimeDB>> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB 不可用(非浏览器环境)");
  }
  dbPromise ??= openDB<ReadTimeDB>(DB_NAME, DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      // v1:初始建库。后续版本在此追加 `if (oldVersion < n)` 迁移逻辑。
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("settings");
      db.createObjectStore("progress");
      const reviews = db.createObjectStore("reviewStates", { keyPath: "wordId" });
      reviews.createIndex("by-due", "dueDate");
      reviews.createIndex("by-lapse", "lapses");
      db.createObjectStore("dailyLogs", { keyPath: "date" });
      const sessions = db.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("by-startedAt", "startedAt");
      const assessments = db.createObjectStore("assessments", { keyPath: "id" });
      assessments.createIndex("by-takenAt", "takenAt");
      const outbox = db.createObjectStore("outbox", { keyPath: "id" });
      outbox.createIndex("by-createdAt", "createdAt");
      tx.objectStore("meta").put({ key: "schemaVersion", value: DB_VERSION });
    },
  });
  return dbPromise;
}
