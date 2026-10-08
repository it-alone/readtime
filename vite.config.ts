import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// 阶段 0:SPA Mode(ssr: false,纯静态托管,数据经 clientLoader + IndexedDB)
// 阶段 1:改回 ssr: true,开启 SSR/resource routes(见 ARCHITECTURE.md §4.1/§9)
//
// 子路径部署(GitHub Pages 项目站点等):构建时传 BASE_PATH=/readtime/,
// vite base 与 remix basename 同源;默认 "/" 对应根路径托管(本地预览/Vercel 等)。
// 尾斜杠归一(与 scripts/patch-sw-assets.mjs 同规则):vite 对 "/readtime" 这类
// 缺尾斜杠的 base 部分按纯拼接产 URL,会得到 /readtimeassets/ 断链。
const RAW_BASE_PATH = process.env.BASE_PATH ?? "/";
const BASE_PATH = RAW_BASE_PATH.endsWith("/") ? RAW_BASE_PATH : `${RAW_BASE_PATH}/`;

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    remix({
      ssr: false,
      basename: BASE_PATH,
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
});
