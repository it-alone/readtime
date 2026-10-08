import { Link, useLoaderData } from "@remix-run/react";
import { Card, PageShell } from "~/components/ui";
import { VocabSession } from "~/features/vocab/VocabSession";
import { getServices } from "~/lib/api/local";

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [task, distractors] = await Promise.all([
    services.vocab.getTodayTask(),
    services.vocab.distractorPool(24),
  ]);
  return { task, distractors };
}
clientLoader.hydrate = true;

export default function LearnVocab() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  if (data.task.items.length === 0) {
    return (
      <PageShell title="词汇学习">
        <Card className="space-y-3 text-center">
          <p className="text-5xl">🎉</p>
          <p className="font-semibold">今日任务全部完成!</p>
          <p className="text-sm text-slate-500">
            明天会有新的到期复习(SM-2 调度),记得回来打卡保持连胜。
          </p>
          <Link to="/" className="inline-block text-sm text-emerald-600 underline">
            返回首页
          </Link>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell title="词汇学习">
      <VocabSession task={data.task} distractors={data.distractors} />
    </PageShell>
  );
}
