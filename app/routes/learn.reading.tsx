import { Outlet } from "@remix-run/react";

// 布局路由:/learn/reading 下的子路由按扁平规则嵌套在此。
// 列表在 learn.reading._index.tsx,文章页在 learn.reading.$articleId.tsx;
// 本身不渲染任何 UI,只透传 Outlet(否则子路由内容无处挂载)。

export default function ReadingLayout() {
  return <Outlet />;
}
