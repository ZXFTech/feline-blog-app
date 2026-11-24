"use client";

import { BlogEditorSession } from "@/components/BlogList/BlogEditorSession";
import {
  getBlogDraft,
  getBlogEditorData,
  publishBlogDraft,
  saveBlogDraft,
} from "@/db/blogDraftAction";
import type { DraftAdapter } from "@/lib/blog/draft-controller";
import type { BlogEditorSeed } from "@/types/blog-draft";
import type { TagData } from "@/components/TagEditor";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

const adapter: DraftAdapter = {
  save: saveBlogDraft,
  publish: publishBlogDraft,
  load: (draftId, blogId) => (blogId === null ? getBlogDraft(draftId) : getBlogEditorData(blogId)),
  onSaved(draftId) {
    if (window.location.pathname !== "/blog/new") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("draft") === draftId) return;
    url.searchParams.set("draft", draftId);
    window.history.replaceState(window.history.state, "", url);
  },
};
export default function BlogEditor({
  seed,
  optionTags = [],
}: {
  seed: BlogEditorSeed;
  optionTags?: TagData[];
}) {
  const router = useRouter();
  const navigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );
  return (
    <BlogEditorSession
      seed={seed}
      adapter={adapter}
      optionTags={optionTags}
      onNavigate={navigate}
    />
  );
}
