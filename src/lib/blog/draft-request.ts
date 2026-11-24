import type { SaveDraftInput } from "@/types/blog-draft";

// Keep Next's default 1 MiB Server Action body limit. These arguments contain
// only fresh plain objects and scalar values, so Flight sends one JSON string.
// Flight escapes strings beginning with "$" with an additional "$".
export function draftSaveFitsRequest(input: SaveDraftInput): boolean {
  const body = JSON.stringify([input], (_key, value: unknown) =>
    typeof value === "string" && value.startsWith("$") ? `$${value}` : value
  );
  return new TextEncoder().encode(body).byteLength <= 1024 * 1024;
}
