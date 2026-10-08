import { Link, useLoaderData } from "@remix-run/react";
import { EmptyState, PageShell } from "~/components/ui";
import { VocabSession } from "~/features/vocab/VocabSession";
import { getServices } from "~/lib/api/local";
import { useServices } from "~/context/providers";

// 今日听写(见 ARCHITECTURE.md §6.2 听力题型):
// 从已学词生成听音选词/听写,自动播放发音,不写 SM-2、不推进词库指针。

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  return getServices().vocab.buildListeningPractice();
}
clientLoader.hydrate = true;

export default function ListeningDictation() {
  const data = useLoaderData<typeof clientLoader>();
  const services = useServices();
  if (!data) return null;

  if (data.task.items.length === 0) {
    return (
      <PageShell title="今日听写" back="/learn/listening">
        <EmptyState
          icon="🎧"
          title="还没有可以练习的词"
          hint={
            <>
              听写从你已学过的词里出题(优先最该复习的词)。先去完成几组新词,再回来练听力。
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
    <PageShell title="今日听写" back="/learn/listening">
      <VocabSession
        task={data.task}
        distractors={data.distractors}
        audio
        rate={data.rate}
        complete={services.vocab.completeListeningSession}
      />
    </PageShell>
  );
}
