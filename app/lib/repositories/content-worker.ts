import { CONTENT_SCHEMAS, type ContentKind } from "./content-schemas";

// 内容加载 Worker:fetch + JSON.parse + zod 校验全部在后台线程完成。
// 词库整 stage 数 MB、语法/阅读/听力正文分片上百 KB,在主线程解析会让
// 页面在加载期间卡死(点击无响应);挪进 Worker 后主线程只收结构化克隆的结果。
// 协议与回退逻辑见 content-worker-client.ts;schema 注册表与主线程共用 content-schemas.ts。

export interface ContentWorkerRequest {
  id: number;
  url: string;
  kind: ContentKind;
  label: string;
}

export type ContentWorkerResponse =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; message: string };

// DOM lib 下 self 推断为 Window,而 Worker 全局环境无独立类型,收窄成所需形状
const ctx = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<ContentWorkerRequest>) => void): void;
  postMessage(message: ContentWorkerResponse): void;
};

ctx.addEventListener("message", async (event) => {
  const { id, url, kind, label } = event.data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${label}加载失败(${url}): HTTP ${res.status}`);
    const data = CONTENT_SCHEMAS[kind].parse(await res.json());
    ctx.postMessage({ id, ok: true, data });
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
  }
});
