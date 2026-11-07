import { NextRequest, NextResponse } from "next/server";
import { assertBusinessReady, SdkHostError } from "@/lib/auth/sdk/business";
import { maintenanceResponse } from "@/lib/auth/sdk/maintenance-response";
import { getSdkIntegration } from "@/lib/auth/sdk/server";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import { validateReturnTo } from "@user-center/next-better-auth/public";
import { SdkConfigurationError } from "@/lib/auth/sdk/configuration";
import { safeErrorContext } from "@/lib/server/error";
import logger from "@/lib/logger/Logger";
export async function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/auth/user-center/error" && req.nextUrl.search)
    return NextResponse.redirect(new URL("/auth/user-center/error", req.url), 303);
  const headers = new Headers(req.headers);
  headers.set("x-feline-pathname", req.nextUrl.pathname);
  headers.delete("x-user-id");
  headers.delete("x-user-role");
  const pathname = req.nextUrl.pathname;
  const accountSurface =
    /^\/(?:auth|login|register|profile|maintenance)(?:\/|$)/.test(pathname) ||
    pathname === "/album" ||
    pathname.startsWith("/_next/") ||
    pathname === "/api/me" ||
    pathname === "/api/health" ||
    pathname === "/api/account/setup" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/internal/ops/status" ||
    /\.(?:ico|png|jpg|jpeg|webp|svg|woff2?|mp3|wav|css|js)$/.test(pathname);
  if (!accountSurface) {
    try {
      await assertBusinessReady();
    } catch (error) {
      const reportedCode =
        error && typeof error === "object" && "code" in error ? error.code : null;
      const code =
        typeof reportedCode === "string" &&
        /^(?:P\d{4}|ENVIRONMENT_MISMATCH|AUTH_UNAVAILABLE|INITIALIZATION_PENDING)$/.test(
          reportedCode
        )
          ? reportedCode
          : "BUSINESS_GATE_UNAVAILABLE";
      const name =
        error instanceof Error &&
        [
          "PrismaClientInitializationError",
          "PrismaClientUnknownRequestError",
          "PrismaClientValidationError",
          "PrismaClientRustPanicError",
          "TypeError",
        ].includes(error.name)
          ? error.name
          : "other";
      const message = error instanceof Error ? error.message : "";
      const reasons = [
        ["missing_file", /ENOENT|Cannot find module|module not found/i],
        ["tls", /certificate|self.signed|TLS|SSL/i],
        ["compiler", /WebAssembly|wasm|query.compiler/i],
        ["connection", /connect|timeout|timed out|database server|ECONN|ENOTFOUND/i],
        ["permissions", /permission denied|privilege|42501/i],
        ["schema", /does not exist|Unknown argument|Unknown field|column/i],
      ] as const;
      logger.log(
        JSON.stringify({
          event: "feline_business_gate",
          ...safeErrorContext("assertBusinessReady", error),
          code:
            error instanceof SdkHostError || error instanceof SdkConfigurationError
              ? error.code
              : code,
          errorName: name,
          reasons: reasons.filter(([, pattern]) => pattern.test(message)).map(([reason]) => reason),
        })
      );
      if (pathname.startsWith("/api/"))
        return NextResponse.json(
          { error: true, message: "业务正在维护，请稍后重试", data: null },
          { status: 503, headers: { "Cache-Control": "no-store" } }
        );
      try {
        const principal = await getSdkIntegration().getPrincipal(req.headers);
        if (principal.status === "mapping-required") {
          const returnTo = validateReturnTo(pathname, getSdkConfiguration().manifest);
          const target = new URL("/auth/setup", req.url);
          target.searchParams.set("returnTo", returnTo);
          const response = NextResponse.redirect(target, 303);
          response.headers.set("Cache-Control", "no-store");
          return response;
        }
      } catch {
        /* Dependency failure keeps the business surface closed. */
      }
      return maintenanceResponse();
    }
  }
  const response = NextResponse.next({ request: { headers } });
  if (
    /^\/(?:auth|login|register|profile|api\/(?:auth|me|account))(?:\/|$)/.test(req.nextUrl.pathname)
  ) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set(
      "Referrer-Policy",
      ["/login", "/register", "/profile"].includes(req.nextUrl.pathname)
        ? "strict-origin"
        : "no-referrer"
    );
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
