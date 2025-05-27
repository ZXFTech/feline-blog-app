import { NextRequest, NextResponse } from "next/server";

import { getBlogList } from "@/db/blogAction";

export async function POST(req: NextRequest) {
  const data = await req.json();
  return NextResponse.json(await getBlogList(data.pageNum, data.pageSize));
}
