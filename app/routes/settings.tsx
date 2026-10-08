import { useRef, useState } from "react";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { Button, Card, PageShell, SectionHeader } from "~/components/ui";
import { useServices } from "~/context/providers";
import { getServices } from "~/lib/api/local";
import type { Settings } from "~/models/types";

export async function clientLoader() {
  if (typeof window === "undefined") return null;
  const services = getServices();
  const [settings, estimate, overview] = await Promise.all([
    services.settings.get(),
    services.storage.estimate(),
    services.storage.overview(),
  ]);
  return { settings, estimate, overview };
}
clientLoader.hydrate = true;

export default function SettingsPage() {
  const data = useLoaderData<typeof clientLoader>();
  const services = useServices();
  const revalidator = useRevalidator();
  const [dailyNewWords, setDailyNewWords] = useState<number>(data?.settings.dailyNewWords ?? 10);
  const [audioRate, setAudioRate] = useState<Settings["audioRate"]>(data?.settings.audioRate ?? 1);
  const [message, setMessage] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!data) return null;

  const save = async (): Promise<void> => {
    const next: Settings = { ...data.settings, dailyNewWords, audioRate };
    await services.settings.save(next);
    setMessage("已保存 ✓");
    setTimeout(() => setMessage(""), 2000);
  };

  const exportData = async (): Promise<void> => {
    const bundle = await services.storage.exportAll();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `readtime-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("已导出备份文件 ✓");
    setTimeout(() => setMessage(""), 2000);
  };

  const importData = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const bundle: unknown = JSON.parse(text);
      await services.storage.importAll(bundle);
      // 免整页刷新:重跑本页 clientLoader(概览数字),其余路由在下次导航时自然重取
      await revalidator.revalidate();
      const imported = (bundle as { data?: { settings?: Settings } }).data?.settings;
      if (imported) {
        setDailyNewWords(imported.dailyNewWords);
        setAudioRate(imported.audioRate);
      }
      setMessage("导入成功,页面数据已刷新 ✓");
      setTimeout(() => setMessage(""), 2000);
    } catch (e) {
      setMessage(`导入失败:${e instanceof Error ? e.message : "数据格式错误"}`);
    }
  };

  const usageMb = data.estimate ? (data.estimate.usage / 1024 / 1024).toFixed(1) : null;
  const quotaMb = data.estimate ? (data.estimate.quota / 1024 / 1024).toFixed(0) : null;

  return (
    <PageShell title="设置" back="/">
      <Card className="space-y-4">
        <SectionHeader eyebrow="PACE · 节奏" title="学习节奏" />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-600">每日新词数量</span>
          <select
            value={dailyNewWords}
            onChange={(e) => setDailyNewWords(Number(e.target.value))}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          >
            {/* 导入的备份可能带预设之外的值:并入选项避免显示成第一个预设 */}
            {[...new Set([5, 10, 15, 20, dailyNewWords])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n} 个/天{n === 10 ? "(推荐)" : ""}
                </option>
              ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-600">听力播放语速</span>
          <select
            value={audioRate}
            onChange={(e) => setAudioRate(Number(e.target.value) as Settings["audioRate"])}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm font-medium outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          >
            {[0.5, 0.75, 1, 1.25, 1.5].map((r) => (
              <option key={r} value={r}>
                {r === 1 ? "1x(原速)" : `${r}x`}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-relaxed text-slate-400">
          按第一年计划(一年 3000 词),每天 10 词 + 到期复习,约 45 分钟。
        </p>
        <Button className="w-full" onClick={() => void save()}>
          保存
        </Button>
      </Card>

      <Card className="space-y-3">
        <SectionHeader eyebrow="DATA · 数据" title="数据概览" />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-slate-50/80 px-2 py-3 ring-1 ring-slate-900/5">
            <p className="bg-gradient-to-b from-emerald-500 to-teal-600 bg-clip-text text-lg font-black tabular-nums text-transparent">
              {data.overview.learnedWords}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">已学单词</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-2 py-3 ring-1 ring-slate-900/5">
            <p className="bg-gradient-to-b from-amber-400 to-orange-500 bg-clip-text text-lg font-black tabular-nums text-transparent">
              {data.overview.activeDays}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">有效打卡天</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-2 py-3 ring-1 ring-slate-900/5">
            <p className="bg-gradient-to-b from-violet-500 to-purple-600 bg-clip-text text-lg font-black tabular-nums text-transparent">
              {data.overview.xp}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">累计 XP</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-2 py-3 ring-1 ring-slate-900/5">
            <p className="bg-gradient-to-b from-violet-500 to-purple-600 bg-clip-text text-lg font-black tabular-nums text-transparent">
              {data.overview.grammarLessonsDone}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">完成语法课</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-2 py-3 ring-1 ring-slate-900/5">
            <p className="bg-gradient-to-b from-amber-500 to-orange-500 bg-clip-text text-lg font-black tabular-nums text-transparent">
              {data.overview.articlesRead}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">已读文章</p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 px-2 py-3 ring-1 ring-slate-900/5">
            <p className="bg-gradient-to-b from-sky-500 to-indigo-500 bg-clip-text text-lg font-black tabular-nums text-transparent">
              {data.overview.sessions}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">学习会话</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          导出备份将包含以上全部数据(设置、进度、复习状态、打卡日志、会话历史)。
        </p>
      </Card>

      <Card className="space-y-3">
        <SectionHeader eyebrow="BACKUP · 备份" title="数据管理" />
        <p className="text-xs leading-relaxed text-slate-400">
          学习数据存储在本机 IndexedDB(库名 readtime),不上传任何服务器。
          {usageMb !== null ? ` 当前占用 ${usageMb} MB / 配额约 ${quotaMb} MB。` : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => void exportData()}>
            导出备份
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => fileRef.current?.click()}>
            导入数据
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importData(file);
            }}
          />
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          导入会覆盖当前本机的学习进度,建议先导出一份备份。
        </p>
      </Card>

      {message ? (
        <p className="rounded-2xl bg-emerald-50 py-2.5 text-center text-sm font-semibold text-emerald-600 ring-1 ring-emerald-100">
          {message}
        </p>
      ) : null}

      <p className="pb-2 text-center text-xs text-slate-400">
        readTime · 三年英语学习计划 · 阶段 0(纯前端 + IndexedDB)
      </p>
    </PageShell>
  );
}
