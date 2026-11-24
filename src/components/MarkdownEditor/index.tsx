/* eslint-disable @next/next/no-html-link-for-pages -- The explicit exit preserves a real href while flushing pending drafts. */
"use client";

import {
  type ChangeEventHandler,
  type MouseEventHandler,
  type ReactNode,
  useLayoutEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Dialog } from "@/components/ui/dialog";
import { NeuPanel } from "@/components/ui/neu-panel";
import { NeuSurface } from "@/components/ui/neu-surface";
import { Button, buttonVariants } from "@/components/ui/button";
import { BlogMarkdown } from "@/components/Blog/BlogMarkdown";
import { InputField } from "@/components/ui/input-field";
import TagEditor, { type TagData } from "@/components/TagEditor";
import { cn } from "@/lib/utils";

interface Props {
  handleSubmit: () => void;
  loading?: boolean;
  blog: { title: string; content: string; tags?: TagData[] };
  onTitleChange: ChangeEventHandler<HTMLInputElement>;
  onContentChange: ChangeEventHandler<HTMLTextAreaElement>;
  onTagChange: (tags: TagData[]) => void;
  onCompositionChange?: (composing: boolean) => void;
  onExit?: MouseEventHandler<HTMLAnchorElement>;
  optionTags?: TagData[];
  status?: ReactNode;
  children?: ReactNode;
  composing?: boolean;
  dialogOpen?: boolean;
}

// Presentation only. Production actions and Album's memory adapter live outside.
export default function MarkdownEditor({
  handleSubmit,
  blog,
  onTitleChange,
  onContentChange,
  onTagChange,
  onCompositionChange,
  onExit,
  optionTags = [],
  loading = false,
  status,
  children,
  composing = false,
  dialogOpen = false,
}: Props) {
  const [preview, setPreview] = useState(false);
  const instanceId = useId();
  const titleId = `${instanceId}-title`;
  const contentId = `${instanceId}-content`;
  const [fullScreen, setFullScreen] = useState(false);
  const [wide, setWide] = useState(true);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const inputPane = useRef<HTMLDivElement>(null);
  const previewPane = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ input: 0, preview: 0 });
  useLayoutEffect(() => {
    if (!frame) return;
    const observer = new ResizeObserver((entries) => setWide(entries[0].contentRect.width >= 768));
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame]);
  useLayoutEffect(() => {
    const input = inputPane.current?.querySelector("textarea");
    if (input) input.scrollTop = scrollPositions.current.input;
    if (previewPane.current) previewPane.current.scrollTop = scrollPositions.current.preview;
  }, [preview, wide, fullScreen]);
  return (
    <div ref={setHost} className="blog-editor-host min-w-0 p-0">
      <Dialog
        open={fullScreen}
        onOpenChange={(open, event) => {
          // A nested Radix dialog can close synchronously before this listener runs.
          // Its consumed native event must not also dismiss the fullscreen editor.
          if (dialogOpen || (event.reason === "escape-key" && event.event.defaultPrevented))
            event.cancel();
          else setFullScreen(open);
        }}
        modal={!dialogOpen}
        disablePointerDismissal
      >
        {host ? (
          <DialogPrimitive.Portal container={host} keepMounted>
            <DialogPrimitive.Popup
              render={<NeuPanel />}
              ref={setFrame}
              hidden={false}
              role={fullScreen ? "dialog" : "region"}
              aria-label="文章编辑器"
              initialFocus={fullscreenButton}
              finalFocus={fullscreenButton}
              className={cn("blog-editor-frame min-w-0", fullScreen && "blog-editor-fullscreen")}
              data-fullscreen={fullScreen}
            >
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-[var(--spacing-panel-gap-default)] p-0">
                <a
                  href="/blog/drafts"
                  onClick={(event) => {
                    if (loading) event.preventDefault();
                    else onExit?.(event);
                  }}
                  aria-disabled={loading || undefined}
                  className={buttonVariants()}
                  data-slot="button"
                >
                  退出编辑
                </a>
                <div className="flex flex-wrap items-center gap-[var(--spacing-panel-gap-default)] p-0">
                  <Button
                    ref={fullscreenButton}
                    aria-pressed={fullScreen}
                    onClick={() => setFullScreen((value) => !value)}
                  >
                    {fullScreen ? "退出全屏" : "全屏"}
                  </Button>
                  <Button aria-pressed={preview} onClick={() => setPreview((value) => !value)}>
                    {preview ? (wide ? "关闭预览" : "编辑") : "预览"}
                  </Button>
                  <Button
                    variant="primary"
                    loading={loading}
                    disabled={composing}
                    onClick={handleSubmit}
                  >
                    提交
                  </Button>
                </div>
              </div>
              <div
                className="shrink-0 p-0"
                onCompositionStart={() => onCompositionChange?.(true)}
                onCompositionEnd={() => onCompositionChange?.(false)}
              >
                <label htmlFor={titleId} className="sr-only">
                  文章标题
                </label>
                <InputField
                  id={titleId}
                  disabled={loading}
                  className="text-xl font-semibold"
                  placeholder="无标题"
                  value={blog.title}
                  onChange={onTitleChange}
                />
              </div>
              <fieldset
                className="min-w-0 shrink-0 border-0 p-0"
                disabled={loading}
                inert={loading}
                onCompositionStart={() => onCompositionChange?.(true)}
                onCompositionEnd={() => onCompositionChange?.(false)}
              >
                <legend className="sr-only">文章标签</legend>
                <TagEditor
                  setValue={onTagChange}
                  value={(blog.tags ?? []).map((tag) => ({ ...tag }))}
                  options={optionTags}
                />
              </fieldset>
              <div className="shrink-0 min-w-0 [overflow-wrap:anywhere] p-0">
                {status ?? <p role="status">修改后自动保存草稿，提交后公开。</p>}
              </div>
              <div className="blog-editor-panes min-w-0 p-0" data-preview={preview}>
                <div
                  className="blog-editor-input min-w-0 min-h-0 p-[var(--spacing-panel-inset-default)]"
                  ref={inputPane}
                  inert={!wide && preview}
                  aria-hidden={(!wide && preview) || undefined}
                  onCompositionStart={() => onCompositionChange?.(true)}
                  onCompositionEnd={() => onCompositionChange?.(false)}
                >
                  <label htmlFor={contentId} className="sr-only">
                    Markdown 正文
                  </label>
                  <InputField
                    id={contentId}
                    multiline
                    disabled={loading}
                    className="h-full min-h-0 resize-none field-sizing-fixed"
                    placeholder="输入 Markdown 内容..."
                    value={blog.content}
                    onChange={onContentChange}
                    onScroll={(event) => {
                      scrollPositions.current.input = event.currentTarget.scrollTop;
                    }}
                  />
                </div>
                <NeuSurface
                  elevation="inset-sm"
                  ref={previewPane}
                  inert={!preview}
                  aria-hidden={!preview || undefined}
                  onScroll={(event) => {
                    scrollPositions.current.preview = event.currentTarget.scrollTop;
                  }}
                  className="preview-part min-w-0 min-h-0 overflow-auto p-[var(--spacing-panel-inset-default)]"
                >
                  <BlogMarkdown content={blog.content} />
                </NeuSurface>
              </div>
              {children}
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        ) : (
          <p role="status">正在准备编辑器…</p>
        )}
      </Dialog>
    </div>
  );
}
