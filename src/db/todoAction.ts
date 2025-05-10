import { ApiResponse } from "@/lib/response/ApiResponse";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";

export async function addTodo(content: string, userId: string) {
  try {
    const todo = await db.todo.create({
      data: {
        content,
        userId: userId || testUserId,
      },
    });
    return ApiResponse.success({ todo });
  } catch (error) {
    const errorMessage = "Add todo failed! " + error;
    logger.error(errorMessage);
    return ApiResponse.error(errorMessage);
  }
}

export async function updateTodo(todoId: number, finish: boolean) {
  try {
    const res = await db.todo.update({
      where: {
        id: todoId,
      },
      data: {
        finish,
      },
    });
    if (!res) {
      return ApiResponse.error("Todo not found!");
    }
    return ApiResponse.success({ todoId });
  } catch (error) {
    const errorMessage = "Update todo failed! " + error;
    logger.error(errorMessage);
    return ApiResponse.error(errorMessage);
  }
}

export async function deleteTodo(todoId: number) {
  try {
    const res = await db.todo.update({
      where: {
        id: todoId,
      },
      data: {
        delete: true,
      },
    });
    if (!res) {
      return ApiResponse.error("Todo not found!");
    }
    return ApiResponse.success({ todoId });
  } catch (error) {
    const errorMessage = "Delete todo failed! " + error;
    logger.error(errorMessage);
    return ApiResponse.error(errorMessage);
  }
}

export async function getTodoList(userId?: string) {
  try {
    const res = await db.todo.findMany({
      where: {
        userId: userId || testUserId,
      },
    });
    return ApiResponse.success({
      todoList: res,
      total: res.length,
      finished: res.filter((todo) => todo.finish).length,
    });
  } catch (error) {
    const errorMessage = "Query todo list failed! " + error;
    logger.error(errorMessage);
    return ApiResponse.error(errorMessage);
  }
}
