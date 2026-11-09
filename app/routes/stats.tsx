import { Outlet } from "@remix-run/react";

// 周报布局壳:/stats 主页与二级页(/stats/modules、/stats/memory)共用;
// 扁平路由下 stats.* 都是本路由的子级,这里只负责渲染出口。

export default function StatsLayout() {
  return <Outlet />;
}
