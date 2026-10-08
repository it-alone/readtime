// readTime service worker(阶段 0 纯前端离线化,见 README"技术栈"):
//   导航请求 network-first → 断网回退缓存的 SPA shell;
//   /assets/*(带 hash 的构建产物)构建时全量预缓存(含未访问路由的 chunk),cache-first;
//   /data/*.json(词库/语法/阅读/听力)network-first,联网时静默更新,内容扩充即时生效。
// IndexedDB 学习数据不经 SW,天然离线。
//
// 部署基路径从注册 scope 推导(根路径部署 → "/",GitHub Pages 项目站点 → "/readtime/"),
// 所有预缓存 URL 与路径匹配统一挂在 BASE 下,两种部署共用同一份 sw.js。

const VERSION = "v10";
const BASE = new URL(self.registration.scope).pathname; // 末尾带 /
const under = (path) => `${BASE}${path.replace(/^\//, "")}`;
const SHELL_CACHE = `readtime-shell-${VERSION}`;
const STATIC_CACHE = `readtime-static-${VERSION}`;
const CONTENT_CACHE = `readtime-content-${VERSION}`;
const AUDIO_CACHE = `readtime-audio-${VERSION}`;
const SHELL_URLS = [
  under(""),
  under("manifest.webmanifest"),
  under("icons/icon-192.png"),
  under("icons/icon-512.png"),
  under("icons/apple-touch-icon.png"),
];
// 内容包预缓存:词库全部分片(每日任务依赖)+ 各模块 index(列表页依赖)。
// 词库/索引也可能分片(单文件 ≤ 500KB 性能预算),URL 清单由 scripts/patch-sw-assets.mjs
// 构建时扫描 public/data 动态注入,新增分片无需手改本文件。
// 语法/阅读/听力正文 part-XX.json(全量 25MB+,不宜预缓存)不在此列:
// 访问过的分片由下方 /data/ network-first 处理器自动落入 CONTENT_CACHE,
// 即"列表全程离线、学过的详情离线可复看"。
const CONTENT_URLS = [];
// 构建时由 scripts/patch-sw-assets.mjs 注入全部带哈希的资源路径,
// 保证任意路由(哪怕从未在线访问过)离线也能加载到自己的 chunk
const PRECACHE_ASSETS = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
      caches.open(CONTENT_CACHE).then((cache) => cache.addAll(CONTENT_URLS)),
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, STATIC_CACHE, CONTENT_CACHE, AUDIO_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航:优先拿最新 shell(scope 内的任意路径都回退到同一 SPA 壳),失败(离线)回退缓存
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // 只缓存正常响应:宿主 404/5xx 页面入缓存会让离线回退取到错误页
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(under(""), copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(under("")).then((hit) => hit || new Response("离线且无缓存", { status: 503 }))
        )
    );
    return;
  }

  // 离线音频包(预生成,内容不变):cache-first,听过一次离线也能播;体积大不做预缓存。
  // WebKit 的 <audio> 取 m4a 会带 Range 头 → 服务器回 206 分片,Cache API 拒绝写入非 200;
  // 且 SW 里 res.clone() 后把原件交还页面消费、副本进缓存,实测存在 tee 体流竞态导致 put 静默失败。
  // 稳妥做法:不带 Range 重新 fetch 完整 200,先读成 ArrayBuffer 再各 new Response——
  // 缓存一份、给页面一份,两份 body 完全独立(单段音频 5–12KB,开销可忽略)。
  if (url.pathname.startsWith(under("audio/"))) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(url.pathname);
        if (hit) return hit;
        try {
          const res = await fetch(url.pathname, { credentials: "same-origin" });
          if (res.ok) {
            const headers = res.headers;
            const buf = await res.arrayBuffer();
            const cache = await caches.open(AUDIO_CACHE);
            await cache.put(url.pathname, new Response(buf, { headers }));
          }
          return res;
        } catch (err) {
          // 缓存路径意外失败时退回直连(带上原始 Range 的 206,媒体元素同样能播)
          return fetch(request);
        }
      })()
    );
    return;
  }

  // 构建产物带内容 hash,缓存即永久有效
  if (url.pathname.startsWith(under("assets/"))) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  // 内容 JSON:联网静默更新,离线用上次缓存
  if (url.pathname.startsWith(under("data/"))) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // 只缓存 200:缺失分片的 404/宿主错误页一旦入缓存,离线回退会一直命中错误响应
          if (res.ok) {
            const copy = res.clone();
            caches.open(CONTENT_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
});
