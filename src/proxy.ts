import { NextRequest, NextResponse } from "next/server";
export function proxy(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-feline-pathname", req.nextUrl.pathname);
  headers.delete("x-user-id");
  headers.delete("x-user-role");
  const response = NextResponse.next({ request: { headers } });
  if (/^\/(?:auth|login|register|profile|api\/auth)(?:\/|$)/.test(req.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
