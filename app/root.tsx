import type { LinksFunction, MetaFunction } from "@remix-run/node";
import { useEffect } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRevalidator,
  useRouteError,
} from "@remix-run/react";
import { ServicesProvider } from "~/context/providers";
import { subscribeSettingsChanged } from "~/lib/storage/broadcast";
import stylesheet from "~/tailwind.css?url";

// 子路径部署(GitHub Pages /readtime/)下,静态资源引用统一带 BASE_URL 前缀
const BASE = import.meta.env.BASE_URL;

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "manifest", href: `${BASE}manifest.webmanifest` },
  { rel: "apple-touch-icon", href: `${BASE}icons/apple-touch-icon.png` },
  { rel: "icon", type: "image/png", sizes: "192x192", href: `${BASE}icons/icon-192.png` },
];

export const meta: MetaFunction = () => [
  { title: "readTime · 读时" },
  { name: "description", content: "三年系统化英语学习计划(基础 · 进阶 · 高阶)" },
  { name: "theme-color", content: "#10b981" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "default" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-[#f7faf9] text-slate-900 antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/** 生产环境注册 service worker(离线可学);注册失败不影响应用 */
function ServiceWorkerRegister() {
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
    }
  }, []);
  return null;
}

/** 跨标签页设置同步:其他标签页保存设置后,本页 revalidate 活动路由的 clientLoader */
function SettingsSyncBridge() {
  const revalidator = useRevalidator();
  useEffect(() => subscribeSettingsChanged(() => revalidator.revalidate()), [revalidator]);
  return null;
}

export default function App() {
  return (
    <ServicesProvider>
      <ServiceWorkerRegister />
      <SettingsSyncBridge />
      <Outlet />
    </ServicesProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7faf9]">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-2xl shadow-glow">
        📖
      </div>
      <p className="text-sm font-medium text-slate-400">readTime 载入中…</p>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : "未知错误";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7faf9] p-6 text-center">
      <p className="text-5xl">😵</p>
      <h1 className="text-lg font-bold">出错了</h1>
      <p className="text-sm text-slate-500">{message}</p>
      <a
        href={BASE}
        className="mt-1 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow active:scale-95"
      >
        返回首页
      </a>
    </div>
  );
}
