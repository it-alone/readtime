import { Outlet } from "@remix-run/react";

// 布局路由:/learn/grammar 下的子路由按扁平规则嵌套在此。
// 列表在 learn.grammar._index.tsx,课程页在 learn.grammar.$lessonId.tsx;
// 本身不渲染任何 UI,只透传 Outlet(否则子路由内容无处挂载)。

export default function GrammarLayout() {
  return <Outlet />;
}
