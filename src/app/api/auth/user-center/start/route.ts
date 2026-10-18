import { authHttp } from "@/lib/auth/center/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => authHttp(request, "start");

