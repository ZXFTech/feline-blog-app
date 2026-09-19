import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./lib/jwt";

const protectedRoutes = ["/dashboard", "/profile", "/admin"];

const adminRoutes = ["/admin"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-feline-pathname", pathname);

  const continueRequest = () =>
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute) {
    const token = req.cookies.get("token")?.value;

    if (!token) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      const response = NextResponse.redirect(new URL("/login", req.url));
      response.cookies.delete("token");
      return response;
    }

    if (isAdminRoute && decoded.role !== "ADMIN") {
      requestHeaders.set("x-user-id", decoded.userId);
      requestHeaders.set("x-user-role", decoded.role);

      return continueRequest();
    }

    return continueRequest();
  }

  return continueRequest();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
