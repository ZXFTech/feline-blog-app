/* eslint-disable @next/next/no-html-link-for-pages -- Explicit editor exit and confirmed publication links use document navigation for recovery. */
"use client";

import { startTransition, useEffect, useRef, useState, useSyncExternalStore } from "react";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { DraftController, type DraftAdapter } from "@/lib/blog/draft-controller";
import type { BlogEditorSeed } from "@/types/blog-draft";
import type { TagData } from "@/components/TagEditor";

interface Props {
  seed: BlogEditorSeed;
  adapter: DraftAdapter;
  optionTags?: TagData[];
  onNavigate: (href: string) => void;
}
export function BlogEditorSession({ seed, adapter, optionTags = [], onNavigate }: Props) {
  const [controller, setController] = useState(() => new DraftController(seed, adapter));
  const current = controller.getState();
  if (
    (seed.draftId !== null && seed.draftId !== current.draftId) ||
    (seed.draftId === null && seed.blogId !== current.blogId)
  ) {
    setController(new DraftController(seed, adapter));
  }
  return (
    <EditorSessionInstance
      key={controller.sessionId}
      controller={controller}
      optionTags={optionTags}
      onNavigate={onNavigate}
    />
  );
}
function EditorSessionInstance({
  controller,
  optionTags,
  onNavigate,
}: {
  controller: DraftController;
  optionTags: TagData[];
  onNavigate: (href: string) => void;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );
  const [dialog, setDialog] = useState<"load" | "exit" | null>(null);
  const [exitFailed, setExitFailed] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [navigationMessage, setNavigationMessage] = useState("");
  const exitPending = useRef(false);
  const bypassUnload = useRef(false);
  const frozen = controller.isFrozen();
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    if (!controller.isDirty() && !["unknown", "publishing"].includes(state.publication)) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (bypassUnload.current || state.publication === "success") return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [controller, state]);
  const attemptedNavigation = useRef(false);
  useEffect(() => {
    if (state.result?.publicationState !== "available" || attemptedNavigation.current) return;
    attemptedNavigation.current = true;
    try {
      onNavigate(`/blog/${state.result.blogId}`);
    } catch {
      setNavigationMessage("发布已完成，可以通过下方入口查看文章。");
    }
  }, [state.result, onNavigate]);
  async function exit() {
    if (exitPending.current || frozen) return;
    exitPending.current = true;
    try {
      if (controller.isDirty() && !(await controller.flush())) {
        setExitFailed(true);
        return;
      }
      onNavigate("/blog/drafts");
    } catch {
      setNavigationMessage("暂时无法离开，请通过退出编辑入口重试。");
    } finally {
      exitPending.current = false;
    }
  }
  const message =
    state.publication === "success"
      ? state.result?.publicationState === "deleted"
        ? "发布已完成，但文章现已删除"
        : "发布已完成"
      : state.publication === "unknown"
        ? "发布结果尚未确认，请重试确认发布结果"
        : state.publication === "publishing"
          ? "正在提交文章…"
          : state.phase === "conflict"
            ? "草稿已在其他位置更新或删除，已停止自动保存"
            : state.phase === "failed"
              ? "草稿保存或提交失败，当前输入仍保留在本页"
              : state.phase === "saving"
                ? "正在保存草稿…"
                : state.phase === "dirty"
                  ? "有修改尚未保存"
                  : state.phase === "saved"
                    ? "草稿已保存"
                    : "修改后自动保存草稿，提交后公开。";
  return (
    <MarkdownEditor
      blog={state.snapshot}
      optionTags={optionTags}
      loading={frozen}
      composing={state.composing}
      onTitleChange={(event) => controller.update({ title: event.target.value })}
      onContentChange={(event) => controller.update({ content: event.target.value })}
      onTagChange={(tags) => controller.update({ tags })}
      onCompositionChange={(composing) => controller.setComposing(composing)}
      handleSubmit={() => startTransition(() => controller.submit())}
      onExit={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        startTransition(exit);
      }}
      dialogOpen={dialog !== null}
      status={
        <div className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)] p-0">
          <p role="status" aria-live="polite" aria-atomic="true">
            {message}
          </p>
          {state.failure ? (
            <p role="alert">
              {state.failure.message}
              {state.failure.status === "unauthenticated" ? (
                <>
                  {" "}
                  <a href="/login" target="_blank" rel="noopener noreferrer">
                    在新标签页重新登录
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          {state.phase === "failed" && !frozen ? (
            <Button
              className="self-start"
              onClick={() => startTransition(() => controller.retry().then(() => {}))}
            >
              重试保存
            </Button>
          ) : null}
          {state.publication === "unknown" ? (
            <Button
              className="self-start"
              onClick={() => startTransition(() => controller.confirmPublication())}
            >
              重试确认发布结果
            </Button>
          ) : null}
          {state.phase === "conflict" && !frozen ? (
            <div className="flex flex-wrap gap-[var(--spacing-panel-gap-default)] p-0">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.snapshot.content);
                    setCopyFailed(false);
                    setCopyMessage("正文已复制");
                  } catch {
                    setCopyFailed(true);
                    setCopyMessage("复制失败，请选择下方原文后手动复制。");
                  }
                }}
              >
                复制正文
              </Button>
              <Button onClick={() => setDialog("load")}>载入最新草稿</Button>
            </div>
          ) : null}
          {copyMessage ? <p role="alert">{copyMessage}</p> : null}
          {copyFailed ? (
            <textarea
              aria-label="供手动复制的当前正文"
              readOnly
              value={state.snapshot.content}
              className="w-full min-w-0"
              onFocus={(event) => event.currentTarget.select()}
            />
          ) : null}
          {exitFailed ? (
            <div className="flex flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0">
              <p>未能保存，仍停留在编辑页。</p>
              <Button disabled={frozen} onClick={() => startTransition(exit)}>
                重试保存并退出
              </Button>
              <Button disabled={frozen} onClick={() => setDialog("exit")}>
                放弃未保存修改并退出
              </Button>
            </div>
          ) : null}
          {navigationMessage ? <p role="alert">{navigationMessage}</p> : null}
          {state.result ? (
            state.result.publicationState === "available" ? (
              <a href={`/blog/${state.result.blogId}`} className={buttonVariants()}>
                查看已发布文章
              </a>
            ) : (
              <a href="/blog/drafts" className={buttonVariants()}>
                返回我的草稿
              </a>
            )
          ) : null}
        </div>
      }
    >
      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "load" ? "载入服务器最新草稿？" : "放弃未保存修改并退出？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "load"
                ? "本页标题、正文和标签会被服务器版本替换。你可以先取消并复制正文。"
                : "仅放弃本页尚未保存的修改。服务器已保存的草稿与已发布文章会继续保留。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const chosen = dialog;
                setDialog(null);
                if (chosen === "load")
                  startTransition(async () => {
                    if (await controller.loadLatest()) {
                      setCopyMessage("");
                      setCopyFailed(false);
                      setExitFailed(false);
                    }
                  });
                else {
                  bypassUnload.current = true;
                  try {
                    onNavigate("/blog/drafts");
                  } catch {
                    bypassUnload.current = false;
                    setNavigationMessage("暂时无法离开，请重试。");
                  }
                }
              }}
            >
              {dialog === "load" ? "放弃本页并载入" : "确认放弃并退出"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MarkdownEditor>
  );
}
