import type { DailyLog, Progress, ReviewState } from "~/models/types";

// 导出包类型(与 lib/api/schemas.ts 的 ExportBundleSchema 对应)

export interface ExportBundle {
  app: "readtime";
  version: 1;
  exportedAt: string;
  data: {
    settings: import("~/models/types").Settings;
    progress: Progress;
    reviewStates: ReviewState[];
    dailyLogs: DailyLog[];
    assessments: import("~/models/types").AssessmentResult[];
    /** v1 后期补上;旧备份可能没有 */
    sessions?: import("~/models/types").LearningSession[];
    /** 离线同步队列;旧备份可能没有 */
    outbox?: import("~/models/types").OutboxEntry[];
  };
}
