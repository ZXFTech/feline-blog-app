"use client";
import { useMemo, useRef, useState } from "react";
import { BlogEditorSession } from "@/components/BlogList/BlogEditorSession";
import { BlogDraftsView } from "@/components/BlogList/BlogDraftsView";
import { actionResult } from "@/lib/server/actionResult";
import type { DraftAdapter } from "@/lib/blog/draft-controller";
import type { BlogEditorSeed, DraftListPage } from "@/types/blog-draft";
import { NeuPanel } from "@/components/ui/neu-panel";

const seed: BlogEditorSeed = {
  draftId: "218c66f0-82f5-4ed0-9f63-0c4bf919a8b3",
  blogId: null,
  revision: 1,
  publishedRevision: 0,
  title: "固定本地草稿",
  content: "## 编辑与预览\n\n修改这里，停下 1 秒后保存。\n\n```ts\n  const local = true;  \n```",
  tags: [{ content: "本地演示", color: "#20c997" }],
  savedAt: "2026-10-24T02:00:00Z",
};
const scenarios = [
  "正常保存",
  "慢速保存",
  "保存失败",
  "版本冲突",
  "发布结果不明",
  "草稿列表",
  "列表读取失败",
  "空列表",
];

function LocalEditor({
  scenario,
  onIntent,
}: {
  scenario: string;
  onIntent: (href: string) => void;
}) {
  const stored = useRef(seed);
  const failedOnce = useRef(false);
  const adapter = useMemo<DraftAdapter>(
    () => ({
      async save(input) {
        await new Promise((resolve) => setTimeout(resolve, scenario === "慢速保存" ? 2500 : 350));
        if (scenario === "版本冲突")
          return actionResult.failure("conflict", "服务器已有更新版本。你可以保留或复制本页内容。");
        if (scenario === "保存失败" && !failedOnce.current) {
          failedOnce.current = true;
          return actionResult.failure("temporary_failure", "模拟保存失败，点击重试可恢复。");
        }
        stored.current = {
          ...input,
          draftId: input.draftId,
          revision: input.expectedRevision + 1,
          publishedRevision: 0,
          savedAt: "2026-10-24T02:00:00Z",
        };
        return actionResult.success({
          draftId: input.draftId,
          revision: stored.current.revision,
          publishedRevision: 0,
          savedAt: stored.current.savedAt!,
        });
      },
      async publish(input) {
        if (scenario === "发布结果不明" && !failedOnce.current) {
          failedOnce.current = true;
          throw new Error("Local response loss");
        }
        return actionResult.success({
          blogId: 1,
          publishedRevision: input.expectedRevision,
          publicationState: "available",
        });
      },
      async load() {
        return actionResult.success({ ...seed, title: "服务器最新草稿（本地模拟）", revision: 2 });
      },
    }),
    [scenario]
  );
  return <BlogEditorSession seed={seed} adapter={adapter} onNavigate={onIntent} />;
}
export default function BlogEditorDemo() {
  const [scenario, setScenario] = useState(scenarios[0]);
  const [intent, setIntent] = useState("");
  const [data, setData] = useState<DraftListPage>({
    rows: [
      { id: seed.draftId!, blogId: null, title: seed.title, revision: 1, savedAt: seed.savedAt! },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  const list = scenario.includes("列表");
  return (
    <div className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)] p-0">
      <NeuPanel>
        <label>
          演示场景{" "}
          <select
            aria-label="演示场景"
            className="max-w-full bg-background text-foreground"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          >
            {scenarios.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <p>
          仅使用固定本地数据。编辑内容可查看未保存、保存中、已保存与失败反馈。全屏和预览使用正式编辑器。
        </p>
        {intent ? <p role="alert">已记录导航意图：{intent}</p> : null}
      </NeuPanel>
      {list ? (
        <BlogDraftsView
          data={scenario === "空列表" ? { ...data, rows: [], total: 0 } : data}
          failure={scenario === "列表读取失败" ? "模拟读取失败，可以重试。" : undefined}
          onNavigate={setIntent}
          onPage={() => setScenario("草稿列表")}
          onDelete={async (row) => {
            setData((previous) => ({
              ...previous,
              rows: previous.rows.filter((item) => item.id !== row.id),
              total: 0,
            }));
            return true;
          }}
        />
      ) : (
        <LocalEditor key={scenario} scenario={scenario} onIntent={setIntent} />
      )}
    </div>
  );
}
