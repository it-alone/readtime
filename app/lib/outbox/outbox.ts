import type { OutboxEntry } from "~/models/types";

// 离线同步队列(见 ARCHITECTURE.md §7.3):
// 阶段 0 仅落盘累积;阶段 2 激活 flush(联网时批量幂等上报 /api/*)

export function makeOutboxEntry(type: string, payload: unknown, now: Date): OutboxEntry {
  return {
    id: safeUuid(),
    type,
    payload,
    createdAt: now.toISOString(),
    attempts: 0,
  };
}

export function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeUuid(): string {
  return newUuid();
}
