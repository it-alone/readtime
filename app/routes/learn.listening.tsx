import { Outlet } from "@remix-run/react";

// 布局路由:/learn/listening 下的子路由按扁平规则嵌套在此。
// 素材选择页在 learn.listening._index.tsx,今日听写在 learn.listening.dictation.tsx,
// 精听会话在 learn.listening.$itemId.tsx;本身只透传 Outlet。

export default function ListeningLayout() {
  return <Outlet />;
}
