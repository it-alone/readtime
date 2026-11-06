import type { SVGProps } from "react";

// 线性描边图标(1.8px 圆角端点):「墨蓝 · 暖金」视觉配套,
// 替代 emoji 入口图标,保证跨端渲染一致;无状态,归基础组件层(见 ARCHITECTURE.md §4.3)。

type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

/** 品牌 / 语法:摊开的书 */
export function BookOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Svg>
  );
}

/** 听力:头戴耳机 */
export function HeadphonesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 16v-3a9 9 0 0 1 18 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="2" />
      <rect x="17" y="14" width="4" height="6" rx="2" />
    </Svg>
  );
}

/** 阅读:报刊版面 */
export function NewspaperIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M7 13h5" />
      <path d="M7 16.5h5" />
      <path d="M14.5 13h3" />
      <path d="M14.5 16.5h3" />
    </Svg>
  );
}

/** 发音:麦克风 */
export function MicIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </Svg>
  );
}

/** 短语库:对话气泡 */
export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.4-.25-3.4-.7L4 21l1.7-4.3A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M8.5 10h7" />
      <path d="M8.5 13.5h4.5" />
    </Svg>
  );
}

/** 词库浏览:文件夹 */
export function FolderIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

/** 学习周报:柱状图 */
export function ChartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3v18h18" />
      <path d="M8 17V9" />
      <path d="M13 17V5" />
      <path d="M18 17v-3" />
    </Svg>
  );
}

/** 设置:滑杆 */
export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h9" />
      <circle cx="14.5" cy="6" r="2" />
      <path d="M17 6h4" />
      <path d="M3 12h2" />
      <circle cx="7.5" cy="12" r="2" />
      <path d="M10 12h11" />
      <path d="M3 18h10" />
      <circle cx="15.5" cy="18" r="2" />
      <path d="M18 18h3" />
    </Svg>
  );
}
