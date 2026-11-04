import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import type { ClientLoaderFunctionArgs } from "@remix-run/react";
import { Button, Card, PageShell } from "~/components/ui";
import { VocabSession } from "~/features/vocab/VocabSession";
import { getServices } from "~/lib/api/local";

// ?extra=1:今日日目标达成后的"继续学习"模式,按日目标量继续发新词(见 buildVocabTask)。
// 参数留在 URL 上,结算页"再学一组"revalidate 时自动沿用,可连续加练。
export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  if (typeof window === "undefined") return null;
  const extra = new URL(request.url).searchParams.get("extra") === "1";
  const services = getServices();
  const [task, distractors] = await Promise.all([
    services.vocab.getTodayTask(undefined, { extra }),
    services.vocab.distractorPool(24),
  ]);
  return { task, distractors, extra };
}
clientLoader.hydrate = true;

export default function LearnVocab() {
  const data = useLoaderData<typeof clientLoader>();
  const [, setSearchParams] = useSearchParams();
  if (!data) return null;

  if (data.task.items.length === 0) {
    // extra 模式下仍为空 = 三年词库已学尽(主线不再出新词,只保留复习)
    const exhausted = data.extra;
    return (
      <PageShell title="词汇学习">
        <Card className="space-y-3 text-center">
          <p className="text-5xl">{exhausted ? "🎓" : "🎉"}</p>
          <p className="font-semibold">
            {exhausted ? "三年词库已全部学完!" : "今日任务全部完成!"}
          </p>
          <p className="text-sm text-slate-500">
            {exhausted
              ? "主线新词已学尽,后续按 SM-2 到期复习巩固,直到全部滚瓜烂熟。"
              : "明天会有新的到期复习(SM-2 调度),记得回来打卡保持连胜。意犹未尽也可以现在再学一组。"}
          </p>
          <div className="flex justify-center gap-3 pt-1">
            <Link to="/">
              <Button variant="ghost">返回首页</Button>
            </Link>
            {exhausted ? null : (
              <Button onClick={() => setSearchParams({ extra: "1" })}>继续学习一组</Button>
            )}
          </div>
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
