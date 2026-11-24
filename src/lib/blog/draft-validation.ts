import { parsePositiveInt, parseString } from "@/lib/server/validation";
import type { DraftTag, PublishDraftInput, SaveDraftInput } from "@/types/blog-draft";

export function isDraftId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
export function parseDraftTags(value: unknown): DraftTag[] | null {
  if (!Array.isArray(value)) return null;
  const tags: DraftTag[] = [];
  for (const tag of value) {
    if (!tag || typeof tag !== "object") return null;
    const content = parseString(tag.content, { label: "标签", max: 50 });
    const color = parseString(tag.color, { label: "颜色", max: 50 });
    if (content === null || color === null) return null;
    tags.push({ content, color });
  }
  return tags;
}
export function parseDraftSave(input: unknown): SaveDraftInput | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const title = parseString(r.title, { label: "标题", max: 191, trim: false, allowEmpty: true });
  const content = parseString(r.content, {
    label: "正文",
    max: Number.MAX_SAFE_INTEGER,
    trim: false,
    allowEmpty: true,
  });
  const tags = parseDraftTags(r.tags);
  const blogId = r.blogId === null ? null : parsePositiveInt(r.blogId);
  if (
    !isDraftId(r.draftId) ||
    !isDraftId(r.saveRequestId) ||
    typeof r.expectedRevision !== "number" ||
    !Number.isSafeInteger(r.expectedRevision) ||
    r.expectedRevision < 0 ||
    (r.blogId !== null && blogId === null) ||
    title === null ||
    content === null ||
    tags === null
  )
    return null;
  return {
    draftId: r.draftId.toLowerCase(),
    blogId,
    expectedRevision: r.expectedRevision,
    saveRequestId: r.saveRequestId.toLowerCase(),
    title,
    content,
    tags,
  };
}
export function parsePublishInput(input: unknown): PublishDraftInput | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (
    !isDraftId(r.draftId) ||
    !isDraftId(r.publishRequestId) ||
    typeof r.expectedRevision !== "number" ||
    !Number.isSafeInteger(r.expectedRevision) ||
    r.expectedRevision < 1
  )
    return null;
  return {
    draftId: r.draftId.toLowerCase(),
    expectedRevision: r.expectedRevision,
    publishRequestId: r.publishRequestId.toLowerCase(),
  };
}
