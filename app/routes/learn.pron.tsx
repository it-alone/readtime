import { useLoaderData } from "@remix-run/react";
import { EmptyState, PageShell } from "~/components/ui";
import { PronPlayer } from "~/features/pron/PronPlayer";
import { getServices } from "~/lib/api/local";

// 发音训练(Year 1 标准发音,见 ARCHITECTURE.md §4 模块清单):
// 从已学词挑例句,听标准音 → 跟读 → SpeechRecognition 打分(不支持时自评)。
// 不写 SM-2、不推进词库指针,只发 PRON_CORRECT XP。

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  return getServices().pron.buildDrill();
}
clientLoader.hydrate = true;

export default function LearnPron() {
  const data = useLoaderData<typeof clientLoader>();
  if (!data) return null;

  if (data.items.length === 0) {
    return (
      <PageShell title="发音训练" back="/">
        <EmptyState icon="🎤" title="词库还没有准备好" hint="先去学几组新词,这里就会用你学过的例句生成跟读练习。" />
      </PageShell>
    );
  }

  return (
    <PageShell title="发音训练" back="/">
      <PronPlayer items={data.items} rate={data.rate} />
    </PageShell>
  );
}
