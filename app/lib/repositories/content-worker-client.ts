import { z } from "zod";
import { CONTENT_SCHEMAS, type ContentKind } from "./content-schemas";
import type { ContentWorkerRequest, ContentWorkerResponse } from "./content-worker";

// 内容加载 Worker 客户端(见 content-worker.ts 文件头):
// 浏览器里优先把 fetch+parse+校验交给 Worker;Worker 不可用(测试/SSR)或
// 脚本加载失败时自动退回主线程内联加载,报错文案与原先一致。

/** Worker 基础设施故障(脚本加载失败等),区别于 HTTP/zod 数据错误 */
class WorkerUnavailableError extends Error {}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (data: unknown) => void; reject: (err: Error) => void }>();

function initWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  try {
    // 字面量 new URL 形式让 Vite 构建时单独打包 worker chunk(勿抽成变量)
    const w = new Worker(new URL("./content-worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("message", (event: MessageEvent<ContentWorkerResponse>) => {
      const res = event.data;
      const entry = pending.get(res.id);
      if (!entry) return;
      pending.delete(res.id);
      if (res.ok) entry.resolve(res.data);
      else entry.reject(new Error(res.message));
    });
    // worker 脚本本身加载/执行失败(网络中断、chunk 缺失):作废在途请求,后续调用退回内联
    w.addEventListener("error", () => {
      worker = null;
      for (const entry of pending.values()) entry.reject(new WorkerUnavailableError());
      pending.clear();
    });
    return w;
  } catch {
    return null;
  }
}

async function fetchParsedInline(url: string, kind: ContentKind, label: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}加载失败(${url}): HTTP ${res.status}`);
  return CONTENT_SCHEMAS[kind].parse(await res.json());
}

/** 拉取并校验一份内容 JSON:Worker 优先,数据错误(HTTP/zod)按原样抛出 */
export async function fetchParsed<K extends ContentKind>(
  url: string,
  kind: K,
  label: string,
): Promise<z.infer<(typeof CONTENT_SCHEMAS)[K]>> {
  const w = (worker ??= initWorker());
  if (w) {
    const id = nextId++;
    const viaWorker = new Promise<unknown>((resolve, reject) => pending.set(id, { resolve, reject }));
    w.postMessage({ id, url, kind, label } satisfies ContentWorkerRequest);
    try {
      return (await viaWorker) as z.infer<(typeof CONTENT_SCHEMAS)[K]>;
    } catch (err) {
      if (err instanceof WorkerUnavailableError) {
        return (await fetchParsedInline(url, kind, label)) as z.infer<(typeof CONTENT_SCHEMAS)[K]>;
      }
      throw err;
    }
  }
  return (await fetchParsedInline(url, kind, label)) as z.infer<(typeof CONTENT_SCHEMAS)[K]>;
}
