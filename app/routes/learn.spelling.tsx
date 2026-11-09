import { Link, useLoaderData } from "@remix-run/react";
import { EmptyState, PageShell } from "~/components/ui";
import { VocabSession } from "~/features/vocab/VocabSession";
import { getServices } from "~/lib/api/local";
import { useServices } from "~/context/providers";

// 单词拼写(见 ARCHITECTURE.md §6.2 题型):
// 从已学词全量随机抽 30 词"看义拼写",同一轮不重复;
// 之前拼错的词优先回归,直至拼对才退出轮换。不写 SM-2、不推进词库指针。

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  return getServices().vocab.buildSpellingPractice();
}
clientLoader.hydrate = true;

export default function SpellingDrill() {
  const data = useLoaderData<typeof clientLoader>();
  const services = useServices();
  if (!data) return null;

  if (data.task.items.length === 0) {
    return (
      <PageShell title="单词拼写" back="/practice">
        <EmptyState
          icon="✏️"
          title="还没有可以拼写的词"
          hint={
            <>
              拼写从你已学过的词里随机出 30 词。先去完成几组新词,再回来练习拼写。
              <Link to="/learn/vocab" className="mt-2 block font-semibold text-emerald-600 underline underline-offset-4">
                去学新词 →
              </Link>
            </>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell title="单词拼写" back="/practice">
      {data.wrongCount > 0 ? (
        <p className="rounded-2xl bg-teal-50/80 px-4 py-2.5 text-xs font-medium text-teal-700 ring-1 ring-teal-100">
          🔁 之前拼错的 {data.wrongCount} 个词已优先加入本轮,拼对后不再重复出现
        </p>
      ) : null}
      <VocabSession
        task={data.task}
        distractors={[]}
        complete={services.vocab.completeSpellingSession}
      />
    </PageShell>
  );
}
