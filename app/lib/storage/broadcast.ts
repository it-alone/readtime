// 跨标签页设置同步(见 ARCHITECTURE.md §4.4 / §7.2):
// 设置在 IndexedDB 落盘后经 BroadcastChannel 广播,其他标签页订阅后
// revalidate 当前路由的 clientLoader,读取到最新设置——
// 不使用 localStorage 的 storage 事件(ADR-007:本地存储一律 IndexedDB)。

const CHANNEL = "readtime-settings";
const MESSAGE = "settings-changed";

/** 设置变更广播(保存/导入后调用;不支持的浏览器静默跳过) */
export function broadcastSettingsChanged(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: MESSAGE });
    channel.close();
  } catch {
    // 广播失败不影响保存流程
  }
}

/** 订阅设置变更;返回取消订阅函数 */
export function subscribeSettingsChanged(callback: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    if ((event.data as { type?: string } | null)?.type === MESSAGE) callback();
  };
  return () => channel.close();
}
