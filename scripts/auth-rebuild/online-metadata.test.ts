// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const files = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files }));
import { checkOnlineMetadata } from "./online-metadata";
import { onlineTarget as target } from "./online-target";
const metadata = () => ({
  issuer: target.issuer,
  user_center_environment: "production",
  authorization_endpoint: target.issuer + "/oauth2/authorize",
  token_endpoint: target.issuer + "/oauth2/token",
  jwks_uri: target.issuer + "/jwks",
});
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  files.writeFile.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it("requires the production declaration and stops before another request when it is absent", async () => {
  fetchMock.mockResolvedValue(Response.json({ ...metadata(), user_center_environment: undefined }));
  expect(await checkOnlineMetadata()).toMatchObject({
    status: "BLOCKED",
    code: "ENVIRONMENT_MISMATCH",
    declaredEnvironment: "missing",
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("does not follow a foreign JWKS endpoint", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ ...metadata(), jwks_uri: "https://foreign.example.test/jwks" })
  );
  expect(await checkOnlineMetadata()).toMatchObject({
    status: "BLOCKED",
    code: "UNTRUSTED_METADATA",
  });
  expect(fetchMock).toHaveBeenCalledOnce();
});
it("uses two public requests without credentials or redirect following", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json(metadata()))
    .mockResolvedValueOnce(
      Response.json({ keys: [{ kid: "fixture", kty: "OKP", crv: "Ed25519", x: "fixture" }] })
    );
  expect(await checkOnlineMetadata()).toMatchObject({
    status: "PASS",
    environment: "production",
    publicGetOnly: true,
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [, options] of fetchMock.mock.calls) {
    expect(options).toMatchObject({
      redirect: "error",
      credentials: "omit",
      headers: { accept: "application/json" },
    });
    expect(Object.keys(options.headers)).toEqual(["accept"]);
  }
});
it("rejects private material in a JWKS", async () => {
  fetchMock
    .mockResolvedValueOnce(Response.json(metadata()))
    .mockResolvedValueOnce(
      Response.json({ keys: [{ kid: "fixture", kty: "RSA", d: "private-fixture" }] })
    );
  expect(await checkOnlineMetadata()).toMatchObject({
    status: "BLOCKED",
    code: "UNTRUSTED_METADATA",
  });
});
it("classifies invalid JSON as untrusted metadata", async () => {
  fetchMock.mockResolvedValue(new Response("not-json"));
  expect(await checkOnlineMetadata()).toMatchObject({
    status: "BLOCKED",
    code: "UNTRUSTED_METADATA",
  });
});
it("does not expose dependency errors in its report", async () => {
  fetchMock.mockRejectedValue(Error("private-diagnostic-canary"));
  const result = await checkOnlineMetadata();
  expect(result).toMatchObject({ status: "BLOCKED", code: "CENTER_UNAVAILABLE" });
  expect(JSON.stringify(result)).not.toContain("private-diagnostic-canary");
});
