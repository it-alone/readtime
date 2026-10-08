import { useLoaderData } from "@remix-run/react";
import { getServices } from "~/lib/api/local";
import { ItemPlayer } from "~/features/listening/ItemPlayer";

// 精听详情页:路由只做数据编排(ARCHITECTURE.md §4.3),交互在 features/listening/

export async function clientLoader({ params }: { params: { itemId: string } }) {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [item, settings] = await Promise.all([
    services.listening.getItem(params.itemId),
    services.settings.get(),
  ]);
  if (!item) {
    throw new Response("听力素材不存在", { status: 404 });
  }
  return { item, rate: settings.audioRate };
}
clientLoader.hydrate = true;

export default function ListeningItemPage() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;
  return <ItemPlayer item={data.item} rate={data.rate} />;
}
