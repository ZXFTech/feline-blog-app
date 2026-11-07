import { describe, expect, it } from "vitest";
import { GET as oldMe } from "@/app/api/auth/me/route";
import { POST as oldLogin } from "@/app/api/auth/login/route";
import { POST as oldLogout } from "@/app/api/auth/logout/route";
import { POST as oldBridge } from "@/app/api/auth/callback/user-center/route";
import { POST as oldBinding } from "@/app/api/auth/user-center/bind/confirm/route";
describe("superseded auth entrypoints", () => {
  it.each([oldMe, oldLogin, oldLogout, oldBridge, oldBinding])(
    "does not accept old credentials or protocol bridge inputs",
    async (handler) => {
      const result = await handler();
      expect(result.status).toBe(404);
      expect(result.headers.get("set-cookie")).toBeNull();
      expect(result.headers.get("cache-control")).toBe("no-store");
    }
  );
});
