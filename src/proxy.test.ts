import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

describe("proxy route context", () => {
  it("covers: Album AC-1, forwards the real Album pathname to the root layout", async () => {
    const request = new NextRequest("http://localhost/album?component=button", {
      headers: { "x-feline-pathname": "/spoofed" },
    });

    const response = await proxy(request);

    expect(response.headers.get("x-middleware-request-x-feline-pathname")).toBe("/album");
    expect(response.headers.get("x-middleware-override-headers")).toContain("x-feline-pathname");
  });
});
