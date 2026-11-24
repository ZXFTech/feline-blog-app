"use client";
import { type MouseEvent, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DraftListPage, DraftListRow } from "@/types/blog-draft";

interface Props {
  data: DraftListPage | null;
  busy?: boolean;
  failure?: string;
  onPage: (page: number) => void;
  onDelete: (row: DraftListRow) => Promise<boolean>;
  onNavigate?: (href: string) => void;
}
function SavedTime({ iso }: { iso: string }) {
  const hydrated = useSyncExternalStore(
    subscribeTime,
    () => true,
    () => false
  );
  const formatted = hydrated ? new Date(iso).toLocaleString() : iso;
  return <time dateTime={iso}>{formatted}</time>;
}
const subscribeTime = () => () => {};
export function BlogDraftsView({
  data,
  busy = false,
  failure,
  onPage,
  onDelete,
  onNavigate,
}: Props) {
  const [target, setTarget] = useState<DraftListRow | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const removing = useRef(false);
  const link = (href: string) =>
    onNavigate
      ? (event: MouseEvent<HTMLAnchorElement>) => {
          event.preventDefault();
          onNavigate(href);
        }
      : undefined;
  return (
    <NeuPanel className="min-w-0 [overflow-wrap:anywhere]" aria-busy={busy}>
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold">
        我的草稿
      </h1>
      <p>自动保存的内容仅自己可见，提交后才会公开。</p>
      <div className="flex flex-wrap gap-[var(--spacing-panel-gap-default)] p-0">
        <Link
          href="/blog/new"
          onClick={link("/blog/new")}
          className={buttonVariants({ variant: "primary" })}
        >
          新建文章
        </Link>
        <Link href="/blog" onClick={link("/blog")} className={buttonVariants()}>
          返回文章列表
        </Link>
      </div>
      <p role="status">
        {busy
          ? "正在读取草稿…"
          : data
            ? `共 ${data.total} 份待发布草稿，第 ${data.page} 页`
            : "草稿暂不可用"}
      </p>
      {failure ? (
        <div className="p-0">
          <p role="alert">{failure}</p>
          <Button disabled={busy} onClick={() => onPage(data?.page ?? 1)}>
            重新读取草稿
          </Button>
        </div>
      ) : null}
      {data?.rows.length === 0 ? <p>还没有待发布的草稿</p> : null}
      {data?.rows.length ? (
        <ul className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)] p-0">
          {data.rows.map((row) => (
            <li key={row.id} data-draft-id={row.id} className="min-w-0 p-0">
              <NeuPanel elevation="inset-sm" className="min-w-0">
                <h2 className="font-semibold">{row.title || "无标题"}</h2>
                <p>{row.blogId === null ? "新文章草稿" : "已发布文章的修改"}</p>
                <p>
                  最后保存：
                  <SavedTime iso={row.savedAt} />
                </p>
                <div className="flex flex-wrap gap-[var(--spacing-panel-gap-default)] p-0">
                  <a
                    href={
                      row.blogId === null ? `/blog/new?draft=${row.id}` : `/blog/edit/${row.blogId}`
                    }
                    onClick={link(
                      row.blogId === null ? `/blog/new?draft=${row.id}` : `/blog/edit/${row.blogId}`
                    )}
                    className={buttonVariants()}
                  >
                    继续编辑
                  </a>
                  <Button
                    disabled={busy}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setTarget(row);
                    }}
                  >
                    删除草稿
                  </Button>
                </div>
              </NeuPanel>
            </li>
          ))}
        </ul>
      ) : null}
      {data && data.total > data.pageSize ? (
        <nav
          aria-label="草稿分页"
          className="flex flex-wrap gap-[var(--spacing-panel-gap-default)] p-0"
        >
          <Button disabled={busy || data.page <= 1} onClick={() => onPage(data.page - 1)}>
            上一页
          </Button>
          <Button
            disabled={busy || data.page * data.pageSize >= data.total}
            onClick={() => onPage(data.page + 1)}
          >
            下一页
          </Button>
        </nav>
      ) : null}
      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这份草稿？</AlertDialogTitle>
            <AlertDialogDescription>
              草稿内容将被清除。已发布文章会继续保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={() => {
                if (!target || removing.current) return;
                removing.current = true;
                const row = target;
                const next = trigger.current
                  ?.closest("li")
                  ?.nextElementSibling?.querySelector<HTMLElement>("a");
                setTarget(null);
                void onDelete(row)
                  .then((success) => {
                    if (!success) return;
                    requestAnimationFrame(() => {
                      if (
                        document.activeElement !== trigger.current &&
                        document.activeElement !== document.body
                      )
                        return;
                      (next?.isConnected ? next : heading.current)?.focus({ preventScroll: true });
                    });
                  })
                  .finally(() => {
                    removing.current = false;
                  });
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </NeuPanel>
  );
}
