// @vitest-environment node
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nativeFetch } from "./transport";
let server: ReturnType<typeof createServer>, origin: string;
beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { Location: "/ok" }).end(); return; }
    let body = ""; request.on("data", chunk => { body += chunk; });
    request.on("end", () => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ method: request.method, body })); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
describe("0003 bounded Node transport", () => {
  it("AC-10 AC-15 sends the library's actual token body without Next rendering fetch", async () => {
    const response = await nativeFetch(origin + "/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code_verifier: "fixture" }), redirect: "manual" });
    expect(await response.json()).toEqual({ method: "POST", body: "grant_type=authorization_code&code_verifier=fixture" });
  });
  it("AC-10 does not follow a redirect from a pinned endpoint", async () => {
    const response = await nativeFetch(origin + "/redirect", { method: "GET", headers: {}, body: null, redirect: "manual" });
    expect(response.status).toBe(302);
  });
});
