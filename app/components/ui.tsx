import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "@remix-run/react";

// 基础 UI 组件(见 ARCHITECTURE.md §4.3 第 ③ 层):无业务状态。
// 设计语言「青玉 · 纸面」:白纸卡片 + 柔和双层阴影,主行动用青玉→碧蓝渐变,
// 页面顶部薄荷色氛围光 + 玻璃吸顶导航,动效只做淡入与按压反馈(尊重系统减弱动效)。

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-3xl border border-slate-200/70 bg-white p-5 shadow-soft ${className}`}
    >
      {children}
    </section>
  );
}

type ButtonVariant = "primary" | "ghost" | "soft";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-glow hover:from-emerald-400 hover:to-emerald-500 disabled:from-slate-200 disabled:to-slate-200 disabled:shadow-none",
    ghost:
      "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
    soft: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  };
  return (
    <button
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function ProgressBar({
  value,
  max,
  tone = "emerald",
}: {
  value: number;
  max: number;
  tone?: "emerald" | "sky";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out ${
          tone === "emerald" ? "from-emerald-400 to-teal-500" : "from-sky-400 to-indigo-500"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Chip({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * CEFR 级别徽章:A1–B2 固定配色,全站(词库/阅读/听力)统一色相,
 * 学员扫一眼就能定位难度,不再每页一套颜色。
 */
const LEVEL_TONE: Record<string, string> = {
  A1: "bg-emerald-50 text-emerald-600 ring-emerald-200/60",
  A2: "bg-sky-50 text-sky-600 ring-sky-200/60",
  B1: "bg-amber-50 text-amber-600 ring-amber-200/60",
  B2: "bg-rose-50 text-rose-600 ring-rose-200/60",
};

export function LevelChip({
  level,
  className = "",
  children,
}: {
  level: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Chip className={`ring-1 ${LEVEL_TONE[level] ?? "bg-slate-100 text-slate-500 ring-slate-200/60"} ${className}`}>
      {children ?? level}
    </Chip>
  );
}

/** 章节小标题:眉题(全大写小字)+ 主标题,用于列表分组与卡片分区 */
export function SectionHeader({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="px-1">
      {eyebrow ? (
        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600/80">{eyebrow}</p>
      ) : null}
      <h2 className="mt-0.5 text-base font-bold tracking-tight text-slate-900">{title}</h2>
    </div>
  );
}

/**
 * 分组筛选页签:海量内容(3000+/模块)按 年级/CEFR 级别 切片浏览,
 * active 态用各模块主色,与首页磁贴同色相。
 */
export type TabTone = "emerald" | "violet" | "sky" | "amber";

const TAB_TONE: Record<TabTone, string> = {
  emerald: "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-[0_6px_14px_-6px_rgba(16,185,129,0.55)]",
  violet: "bg-gradient-to-b from-violet-500 to-purple-600 text-white shadow-[0_6px_14px_-6px_rgba(139,92,246,0.55)]",
  sky: "bg-gradient-to-b from-sky-500 to-cyan-600 text-white shadow-[0_6px_14px_-6px_rgba(14,165,233,0.55)]",
  amber: "bg-gradient-to-b from-amber-500 to-orange-500 text-white shadow-[0_6px_14px_-6px_rgba(245,158,11,0.55)]",
};

export interface TabItem<K extends string | number> {
  key: K;
  label: string;
  /** 右侧数量角标(如 "1142") */
  badge?: string | number;
}

export function FilterTabs<K extends string | number>({
  tabs,
  value,
  onChange,
  tone = "emerald",
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  tone?: TabTone;
}) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1.5 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all duration-150 active:scale-[0.97] ${
              active ? TAB_TONE[tone] : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined ? (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
                  active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-400"
                }`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** 分页器:‹ 第 x/y 页 ›,翻页后由调用方滚回列表顶部 */
export function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const btn =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center justify-center gap-3 pt-1">
      <button className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ 上一页
      </button>
      <span className="text-xs font-bold tabular-nums text-slate-400">
        {page} / {pageCount}
      </span>
      <button className={btn} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        下一页 ›
      </button>
    </div>
  );
}

/** 空状态:大图标 + 标题 + 引导文案(替代各页自拼的居中段落) */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint?: ReactNode;
}) {
  return (
    <Card className="space-y-3 py-10 text-center">
      <p className="text-5xl">{icon}</p>
      <p className="font-bold text-slate-800">{title}</p>
      {hint ? <p className="mx-auto max-w-xs text-sm leading-relaxed text-slate-500">{hint}</p> : null}
    </Card>
  );
}

/** 空闲/正确/错误/弱化 四态答题选项:语法/阅读/精听三处题板共用同一视觉 */
export function QuizOption({
  index,
  label,
  state,
  disabled,
  onClick,
}: {
  index: number;
  label: string;
  state: "idle" | "correct" | "wrong" | "muted";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const states = {
    idle: "border-slate-200/80 bg-white hover:border-emerald-400 hover:shadow-sm",
    correct: "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-300",
    wrong: "border-rose-400 bg-rose-50/80 ring-1 ring-rose-200",
    muted: "border-slate-200/60 bg-white opacity-40",
  } as const;
  const badge =
    state === "correct"
      ? "bg-emerald-500 text-white"
      : state === "wrong"
        ? "bg-rose-500 text-white"
        : "bg-slate-100 text-slate-500";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium text-slate-800 transition-all duration-150 active:scale-[0.99] disabled:active:scale-100 ${states[state]}`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${badge}`}
      >
        {state === "correct" ? "✓" : state === "wrong" ? "✕" : index + 1}
      </span>
      <span className="leading-snug">{label}</span>
    </button>
  );
}

/** 圆形发音按钮:词库/题板/列表通用 */
export function SpeakButton({
  label,
  onClick,
  className = "",
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-base text-emerald-600 ring-1 ring-emerald-100 transition hover:bg-emerald-100 active:scale-90 ${className}`}
    >
      🔊
    </button>
  );
}

export function PageShell({
  title,
  back,
  children,
}: {
  title: string;
  back?: string;
  children: ReactNode;
}) {
  return (
    <main className="relative mx-auto min-h-screen w-full max-w-lg">
      {/* 顶部氛围光:薄荷渐变晕,替代纯灰底 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-emerald-100/80 via-teal-50/50 to-transparent"
      />
      <header className="sticky top-0 z-20 border-b border-slate-900/5 bg-white/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3">
          {back ? (
            <Link
              to={back}
              aria-label="返回"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xl leading-none text-slate-500 shadow-sm ring-1 ring-slate-900/5 transition hover:text-slate-900 active:scale-90"
            >
              ‹
            </Link>
          ) : null}
          <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">{title}</h1>
        </div>
      </header>
      <div className="relative space-y-4 p-4 pb-10 animate-fade-up">{children}</div>
    </main>
  );
}
