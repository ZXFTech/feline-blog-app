import { NextRequest, NextResponse } from "next/server";
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/auth/user-center/error" && req.nextUrl.search) return NextResponse.redirect(new URL("/auth/user-center/error", req.url), 303);
  const headers = new Headers(req.headers);
  headers.set("x-feline-pathname", req.nextUrl.pathname);
  headers.delete("x-user-id");
  headers.delete("x-user-role");
  const response = NextResponse.next({ request: { headers } });
  if (/^\/(?:auth|login|register|profile|api\/auth)(?:\/|$)/.test(req.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", ["/login", "/register", "/profile"].includes(req.nextUrl.pathname) ? "strict-origin" : "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
