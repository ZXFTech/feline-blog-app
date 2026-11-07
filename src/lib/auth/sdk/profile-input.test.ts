// @vitest-environment node
import { describe, expect, it } from "vitest";
import { emailSnapshotDigest, parseProfileInput } from "@/lib/auth/sdk/profile-input";
const base = {
  action: "complete-profile",
  username: " Reader ",
  emailConfirmed: true,
  emailSnapshotDigest: emailSnapshotDigest("reader@example.test"),
};
describe("profile DTO boundary", () => {
  it("trims nickname and counts Unicode code points", () => {
    expect(parseProfileInput(base)?.action).toBe("complete-profile");
    expect(parseProfileInput({ ...base, username: "🐈".repeat(64) })).not.toBeNull();
    expect(parseProfileInput({ ...base, username: "🐈".repeat(65) })).toBeNull();
  });
  it.each([
    { role: "ROOT" },
    { email: "victim@example.test" },
    { userId: "someone-else" },
    { password: "synthetic" },
  ])("rejects privilege and identity fields", (extra) => {
    expect(parseProfileInput({ ...base, ...extra })).toBeNull();
  });
  it.each(["", "\t", "name\u0000", "name\nother"])(
    "rejects empty or controlled nickname",
    (username) => {
      expect(parseProfileInput({ ...base, username })).toBeNull();
    }
  );
  it("requires explicit email confirmation and the displayed digest", () => {
    expect(parseProfileInput({ ...base, emailConfirmed: false })).toBeNull();
    expect(parseProfileInput({ ...base, emailSnapshotDigest: "" })).toBeNull();
    expect(emailSnapshotDigest("a@example.test")).not.toBe(emailSnapshotDigest("b@example.test"));
  });
  it("uses a distinct confirm-email DTO that cannot overwrite nickname", () => {
    const value = {
      action: "confirm-email",
      emailConfirmed: true,
      emailSnapshotDigest: base.emailSnapshotDigest,
    };
    expect(parseProfileInput(value)?.action).toBe("confirm-email");
    expect(parseProfileInput({ ...value, username: "overwrite" })).toBeNull();
    expect(parseProfileInput({ ...value, returnTo: "/" })).toBeNull();
  });
});
