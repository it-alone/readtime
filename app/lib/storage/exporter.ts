import { getDb, SINGLETON_KEY } from "~/lib/storage/db";
import { ExportBundleSchema } from "~/lib/api/schemas";
import { broadcastSettingsChanged } from "~/lib/storage/broadcast";
import { createDefaultProgress, createDefaultSettings } from "~/models/defaults";
import type { ExportBundle } from "~/lib/storage/types";
import type { LearningSession } from "~/models/types";

// 全量导出/导入(见 ARCHITECTURE.md §7.2):settings 页提供,三年学习记录可备份迁移
// outbox(离线同步队列)随备份迁移,导入覆盖旧队列——旧设备未上报的条目不丢

export async function exportBundle(): Promise<ExportBundle> {
  const db = await getDb();
  const [settings, progress, reviewStates, dailyLogs, assessments, sessions, outbox] =
    await Promise.all([
      db.get("settings", SINGLETON_KEY),
      db.get("progress", SINGLETON_KEY),
      db.getAll("reviewStates"),
      db.getAll("dailyLogs"),
      db.getAll("assessments"),
      db.getAll("sessions"),
      db.getAll("outbox"),
    ]);
  return {
    app: "readtime",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: settings ?? createDefaultSettings(),
      progress: progress ?? createDefaultProgress(new Date()),
      reviewStates,
      dailyLogs,
      assessments,
      sessions,
      outbox,
    },
  };
}

export async function importBundle(bundle: unknown): Promise<void> {
  const parsed = ExportBundleSchema.parse(bundle);
  const db = await getDb();
  const tx = db.transaction(
    ["settings", "progress", "reviewStates", "dailyLogs", "assessments", "sessions", "outbox"],
    "readwrite"
  );
  tx.objectStore("settings").put(parsed.data.settings, SINGLETON_KEY);
  tx.objectStore("progress").put(parsed.data.progress, SINGLETON_KEY);
  // 覆盖式导入:集合存储先清空,本机旧数据不与备份合并(旧备份无 sessions/outbox 字段时该存储保持为空)
  tx.objectStore("reviewStates").clear();
  tx.objectStore("dailyLogs").clear();
  tx.objectStore("assessments").clear();
  tx.objectStore("sessions").clear();
  tx.objectStore("outbox").clear();
  for (const state of parsed.data.reviewStates) tx.objectStore("reviewStates").put(state);
  for (const log of parsed.data.dailyLogs) tx.objectStore("dailyLogs").put(log);
  for (const assessment of parsed.data.assessments) tx.objectStore("assessments").put(assessment);
  if (parsed.data.sessions) {
    // zod 校验的是 number,写入时回到领域类型(字面量联合在运行时等价)
    for (const session of parsed.data.sessions)
      tx.objectStore("sessions").put(session as unknown as LearningSession);
  }
  if (parsed.data.outbox) {
    // zod 推断的 payload 可选,写回时补齐领域类型的必填字段
    for (const entry of parsed.data.outbox)
      tx.objectStore("outbox").put({ ...entry, payload: entry.payload ?? null });
  }
  await tx.done;
  // 设置可能被备份覆盖:广播让其他标签页同步刷新
  broadcastSettingsChanged();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}

/** 数据概览:导出备份前让用户知道将要备份什么(设置页展示) */
export async function dataOverview(): Promise<{
  learnedWords: number;
  sessions: number;
  activeDays: number;
  xp: number;
  grammarLessonsDone: number;
  articlesRead: number;
}> {
  const db = await getDb();
  const [reviewStates, sessions, dailyLogs, progress] = await Promise.all([
    db.getAll("reviewStates"),
    db.getAll("sessions"),
    db.getAll("dailyLogs"),
    db.get("progress", SINGLETON_KEY),
  ]);
  return {
    learnedWords: reviewStates.length,
    sessions: sessions.length,
    activeDays: dailyLogs.filter((l) => l.xp > 0 || l.minutes > 0 || l.newWordsLearned > 0).length,
    xp: progress?.xp ?? 0,
    grammarLessonsDone: progress?.completedGrammarLessons.length ?? 0,
    articlesRead: progress?.readArticles.length ?? 0,
  };
}
