import { NextRequest, NextResponse } from "next/server";

import { addTodo, deleteTodo, getTodoList, updateTodo } from "@/db/todoAction";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const orderBy = searchParams.get("orderBy") === "asc" ? "asc" : "desc";
  const content = searchParams.get("content");
  const finished = searchParams.get("finished")
    ? Boolean(searchParams.get("finished"))
    : null;

  // 获取所有 Todo
  return NextResponse.json(
    await getTodoList({
      orderBy,
      content,
      finished,
    })
  );
}
export async function POST(req: NextRequest) {
  // 创建新 Todo
  const data = await req.json();
  return NextResponse.json(await addTodo(data));
}

export async function PATCH(req: NextRequest) {
  // 更新 Todo
  const data = await req.json();
  return NextResponse.json(await updateTodo(data));
}

export async function DELETE(req: NextRequest) {
  // 删除 todo
  const { todoId } = await req.json();
  return NextResponse.json(await deleteTodo(todoId));
}
