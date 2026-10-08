// 构建后处理(两件事,都在 build/client 原地改写):
// 1. 把 build/client/assets 下全部带哈希的 js/css 写入 sw.js 的 PRECACHE_ASSETS 清单,
//    service worker 安装时全量预缓存——没有这一步,从未在线访问过的路由离线时会因缺 chunk 而白屏。
// 2. 扫描 build/client/data 目录,把内容预缓存清单注入 sw.js 的 CONTENT_URLS:
//    词库全部分片(每日任务依赖)+ 各模块 index/index-part(列表页依赖);
//    语法/阅读/听力正文 part-XX 总量 25MB+,仍走"访问过即缓存",不预缓存。
// (remix vite:build 把 public/ 内容平铺拷进 build/client——内容在 build/client/data,
//  所以只能构建后原地改写)
// 路径带部署基路径前缀(与 vite base 同源的 BASE_PATH,默认 "/"),
// 子路径部署(GitHub Pages /readtime/)下 SW 预缓存才能命中实际 URL。

import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const BASE_PATH = process.env.BASE_PATH ?? "/";
const base = BASE_PATH.endsWith("/") ? BASE_PATH : `${BASE_PATH}/`;

const clientDir = fileURLToPath(new URL("../build/client/", import.meta.url));
const assetsDir = join(clientDir, "assets");

const files = (await readdir(assetsDir))
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => `${base}assets/${f}`)
  .sort();

/** 递归列出目录下全部文件(相对路径,以 / 分隔) */
async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(relative(clientDir, full));
  }
  return out;
}

// 内容预缓存规则(见文件头注释):词库全量、模块只取 index/index-part;audio-manifest 仅是生成记录,不预缓存
const dataDir = join(clientDir, "data");
const contentUrls = (await listFiles(dataDir))
  .filter((rel) => rel.endsWith(".json") && !rel.endsWith("audio-manifest.json"))
  .map((rel) => rel.replaceAll("\\", "/"))
  .filter((rel) => {
    if (rel.startsWith("data/vocab/")) return true; // 词库分片全量预缓存
    return !/\/part-\d+\.json$/.test(rel); // 其余模块只预缓存 index / index-part
  })
  .map((rel) => `${base}${rel}`)
  .sort();

const swPath = join(clientDir, "sw.js");
let sw = await readFile(swPath, "utf8");
const swPatches = [
  ["const PRECACHE_ASSETS = [];", JSON.stringify(files), "PRECACHE_ASSETS"],
  ["const CONTENT_URLS = [];", JSON.stringify(contentUrls), "CONTENT_URLS"],
];
for (const [placeholder, replacement, label] of swPatches) {
  if (!sw.includes(placeholder)) {
    throw new Error(`sw.js 中未找到 ${label} 占位符,请检查 public/sw.js`);
  }
  sw = sw.replace(placeholder, `const ${label} = ${replacement};`);
}
await writeFile(swPath, sw, "utf8");

// GitHub Pages 等纯静态托管没有 SPA 回退:深链接(如 /readtime/learn/grammar)
// 会命中宿主 404 页。放一份 index.html 副本为 404.html,宿主会用它应答——
// 应用壳照常加载,React Router 按 basename 接管路径(状态码仍是 404,可接受)。
await writeFile(join(clientDir, "404.html"), await readFile(join(clientDir, "index.html"), "utf8"), "utf8");

console.log(
  `sw.js 已注入 ${files.length} 个静态资源 + ${contentUrls.length} 个内容索引/词库分片(全量预缓存)+ 404.html SPA 回退`
);
