import { NextRequest, NextResponse } from "next/server";

import { getBlogList } from "@/db/blogAction";

export async function GET(req: NextRequest) {
  // const data = await req.json();

  const params = req.nextUrl.searchParams;

  const orderBy = params.get("orderBy") === "asc" ? "asc" : "desc";
  const content = params.get("content")?.trim() || "";

  return NextResponse.json(
    await getBlogList(1, 20, {
      content,
      orderBy,
    })
  );
}
