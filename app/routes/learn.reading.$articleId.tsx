import { useLoaderData } from "@remix-run/react";
import { getServices } from "~/lib/api/local";
import { ArticleReader } from "~/features/reading/ArticleReader";

// 阅读详情页:路由只做数据编排(ARCHITECTURE.md §4.3),交互在 features/reading/

export async function clientLoader({ params }: { params: { articleId: string } }) {
  if (typeof window === "undefined") return null;
  const article = await getServices().reading.getArticle(params.articleId);
  if (!article) {
    throw new Response("文章不存在", { status: 404 });
  }
  return { article };
}
clientLoader.hydrate = true;

export default function ReadingArticlePage() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;
  return <ArticleReader article={data.article} />;
}
