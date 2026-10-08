import { createContext, useContext, useState } from "react";
import { getServices } from "~/lib/api/local";
import type { Services } from "~/lib/api/local";

// Repository/服务依赖注入唯一入口(见 ARCHITECTURE.md §9 迁移检查清单):
// 阶段 2 切换 Api 实现时,仅改 lib/api/local.ts,本文件不动。

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ children }: { children: React.ReactNode }) {
  // SPA 模式:构建期预渲染无 window,服务对象只在浏览器创建(懒开库,构造零 IO)
  const [services] = useState<Services | null>(() =>
    typeof window === "undefined" ? null : getServices()
  );
  if (!services) return <>{children}</>;
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error("Services 尚未就绪(仅浏览器可用)");
  }
  return services;
}
