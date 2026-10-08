import { useLoaderData } from "@remix-run/react";
import { getServices } from "~/lib/api/local";
import { LessonPlayer } from "~/features/grammar/LessonPlayer";

// 语法课详情页:路由只做数据编排(ARCHITECTURE.md §4.3),交互在 features/grammar/

export async function clientLoader({ params }: { params: { lessonId: string } }) {
  if (typeof window === "undefined") return null;
  const lesson = await getServices().grammar.getLesson(params.lessonId);
  if (!lesson) {
    throw new Response("课程不存在", { status: 404 });
  }
  return { lesson };
}
clientLoader.hydrate = true;

export default function GrammarLessonPage() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;
  return <LessonPlayer lesson={data.lesson} />;
}
