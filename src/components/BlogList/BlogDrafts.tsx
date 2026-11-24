"use client";
import { startTransition, useRef, useState } from "react";
import { BlogDraftsView } from "@/components/BlogList/BlogDraftsView";
import { discardBlogDraft, getMyBlogDrafts } from "@/db/blogDraftAction";
import type { ActionResult } from "@/lib/server/actionResult";
import type { DraftListPage, DraftListRow } from "@/types/blog-draft";

export function BlogDrafts({ initial }: { initial: ActionResult<DraftListPage> }) {
  const [data, setData] = useState(initial.status === "success" ? initial.data : null);
  const [failure, setFailure] = useState(
    initial.status === "success" ? "" : "暂时无法读取草稿，请重试。"
  );
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  async function reload(page: number) {
    const result = await getMyBlogDrafts(page);
    if (result.status !== "success") {
      setFailure(result.message);
      return false;
    }
    setData(result.data);
    setFailure("");
    return true;
  }
  async function run(operation: () => Promise<boolean>) {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    try {
      return await operation();
    } catch {
      setFailure("请求失败，草稿条目仍保留，请重试。");
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  async function remove(row: DraftListRow) {
    return run(async () => {
      const result = await discardBlogDraft({ draftId: row.id, expectedRevision: row.revision });
      if (result.status !== "success") {
        setFailure(
          result.status === "conflict"
            ? "草稿已更新，删除已停止。请重新读取后再决定。"
            : result.message
        );
        return false;
      }
      return reload(data?.page ?? 1);
    });
  }
  return (
    <BlogDraftsView
      data={data}
      failure={failure}
      busy={busy}
      onPage={(page) =>
        startTransition(async () => {
          await run(() => reload(page));
        })
      }
      onDelete={remove}
    />
  );
}
