import { NextRequest, NextResponse } from "next/server";

import { addTodo, getTodoById, getTodoList, updateTodo } from "@/db/todoAction";

export async function GET(req: NextRequest, res: NextResponse) {
  // 获取单个 Todo

  const { todoId, userId } = await req.json();
  return await getTodoById(todoId, userId);
}

export async function PATCH(req: NextRequest, res: NextResponse) {
  // 更新 Todo
  const data = await req.json();
  const id = req.nextUrl;
  console.log("id", id);
  const { content, finished } = data;
  // return NextResponse.json(updateTodo(content, finished));
}
