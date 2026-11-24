import { describe, expect, it } from "vitest";
import { parseDraftSave, parsePublishInput } from "@/lib/blog/draft-validation";

const id = "e96e85a3-26e8-443b-80aa-f0551cb0c455";
describe("private draft input", () => {
  it("preserves empty titles and exact Markdown, including whitespace", () => {
    const input = {
      draftId: id,
      blogId: null,
      expectedRevision: 0,
      saveRequestId: id,
      title: "",
      content: "\n  code  \n\n",
      tags: [{ content: "TS", color: "#20c997" }],
    };
    expect(parseDraftSave(input)).toEqual(input);
  });
  it("rejects malformed identity, versions and tag fields", () => {
    expect(parseDraftSave({ draftId: "other", expectedRevision: -1 })).toBeNull();
    expect(
      parseDraftSave({
        draftId: id,
        blogId: null,
        expectedRevision: 0,
        saveRequestId: id,
        title: "",
        content: "",
        tags: [{ content: "x".repeat(51), color: "blue" }],
      })
    ).toBeNull();
    expect(
      parsePublishInput({ draftId: id, expectedRevision: 0, publishRequestId: id })
    ).toBeNull();
  });
  it("uses PostgreSQL's canonical UUID casing for request retries", () => {
    const parsed = parseDraftSave({
      draftId: id.toUpperCase(),
      blogId: null,
      expectedRevision: 0,
      saveRequestId: id.toUpperCase(),
      title: "",
      content: "",
      tags: [],
    });
    expect(parsed).toMatchObject({ draftId: id, saveRequestId: id });
  });
});
