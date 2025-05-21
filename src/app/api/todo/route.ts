import { NextRequest, NextResponse } from "next/server";

import { addTodo, getTodoList, updateTodo } from "@/db/todoAction";

export async function GET() {
  // 获取所有 Todo
  return NextResponse.json(await getTodoList());
}
export async function POST(req: NextRequest) {
  // 创建新 Todo
  const { content } = await req.json();
  return NextResponse.json(await addTodo(content));
}

export async function PATCH(req: NextRequest) {
  // 更新 Todo
  const data = await req.json();
  return NextResponse.json(await updateTodo(data));
}
