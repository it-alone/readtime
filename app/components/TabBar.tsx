import { Link, useLocation } from "@remix-run/react";
import type { ReactNode } from "react";
import {
  ChartIcon,
  DumbbellIcon,
  FolderIcon,
  HomeIcon,
  SlidersIcon,
} from "~/components/icons";

// 全局底栏(iOS「液态玻璃」风):悬浮胶囊 + 厚磨砂 + 上缘高光发丝线,
// 选中项是一滴更亮的「玻璃珠」(白底内高光 + 缩放弹入),色相沿用暖金行动色。
// 首页只保留任务主线,模块/库/周报/设置全部收进这里(见 ARCHITECTURE.md §4.2)。

interface TabDef {
  to: string;
  /** 命中该 tab 的路径(不含 BASE_URL,remix basename 已剥离) */
  match: RegExp;
  icon: (props: React.SVGProps<SVGSVGElement>) => ReactNode;
  label: string;
}

const TABS: TabDef[] = [
  { to: "/", match: /^\/$/, icon: HomeIcon, label: "今日" },
  // 练习域:练习中枢 + 各训练模块列表/详情 + 短语库(从练习页进入)
  { to: "/practice", match: /^\/(practice|learn|phrases)/, icon: DumbbellIcon, label: "练习" },
  { to: "/words", match: /^\/words/, icon: FolderIcon, label: "词库" },
  { to: "/stats", match: /^\/stats/, icon: ChartIcon, label: "周报" },
  { to: "/settings", match: /^\/settings/, icon: SlidersIcon, label: "设置" },
];

// 沉浸式学习页(词汇答题/听写/拼写/跟读/课文与精听播放器)隐藏底栏:防误触、保持专注
const IMMERSIVE: RegExp[] = [
  /^\/learn\/vocab/,
  /^\/learn\/pron/,
  /^\/learn\/spelling/,
  /^\/learn\/listening\/dictation/,
  /^\/learn\/(grammar|listening|reading)\/[^/]+/,
];

export function TabBar() {
  const { pathname } = useLocation();
  if (IMMERSIVE.some((re) => re.test(pathname))) return null;

  return (
    <nav
      aria-label="主导航"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
    >
      <div className="pointer-events-auto relative flex w-full max-w-[400px] items-stretch rounded-full bg-white/50 p-1.5 ring-1 ring-white/60 shadow-[0_12px_32px_-8px_rgba(28,25,23,0.28),0_2px_8px_rgba(28,25,23,0.08)] backdrop-blur-2xl backdrop-saturate-150">
        {/* 玻璃上缘高光:液态玻璃的「反光发丝线」 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-white/90 to-transparent"
        />
        {TABS.map((t) => {
          const active = t.match.test(pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 transition-transform duration-150 active:scale-90"
            >
              {/* 选中态玻璃珠:常驻渲染,靠缩放/透明度过渡出「弹入」手感 */}
              <span
                aria-hidden
                className={`absolute inset-0 rounded-full bg-white/85 shadow-[0_2px_10px_rgba(28,25,23,0.15),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-300 ${
                  active ? "scale-100 opacity-100" : "scale-75 opacity-0"
                }`}
              />
              <Icon
                className={`relative h-[22px] w-[22px] transition-colors duration-200 ${
                  active ? "text-amber-600" : "text-stone-400"
                }`}
              />
              <span
                className={`relative text-[10px] font-semibold leading-none transition-colors duration-200 ${
                  active ? "text-stone-800" : "text-stone-400"
                }`}
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
