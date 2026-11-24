// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { draftSaveFitsRequest } from "@/lib/blog/draft-request";
import type { SaveDraftInput } from "@/types/blog-draft";

// Verify the estimate against this installation's actual Flight encoder.
const { encodeReply } = createRequire(import.meta.url)(
  "next/dist/compiled/react-server-dom-webpack/client.node"
) as { encodeReply(args: [SaveDraftInput]): Promise<string | FormData> };
const input: SaveDraftInput = {
  draftId: "e96e85a3-26e8-443b-80aa-f0551cb0c455",
  blogId: null,
  expectedRevision: 0,
  saveRequestId: "e96e85a3-26e8-443b-80aa-f0551cb0c455",
  title: "$标题",
  content: '$正文\n"\\😀',
  tags: [{ content: "$标签", color: "currentColor" }],
};

describe("draft request budget", () => {
  it("matches Flight at the exact byte boundary, including all fields and escaping", async () => {
    const encoded = await encodeReply([input]);
    expect(typeof encoded).toBe("string");
    const remaining = 1024 * 1024 - new TextEncoder().encode(encoded as string).length;
    const full = { ...input, content: input.content + "x".repeat(remaining) };
    const wire = await encodeReply([full]);
    expect(new TextEncoder().encode(wire as string)).toHaveLength(1024 * 1024);
    expect(draftSaveFitsRequest(full)).toBe(true);
    expect(draftSaveFitsRequest({ ...full, content: full.content + "x" })).toBe(false);
    expect(
      draftSaveFitsRequest({ ...full, tags: [...full.tags, { content: "新", color: "blue" }] })
    ).toBe(false);
  });
});
