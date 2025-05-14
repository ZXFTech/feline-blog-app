import { actionResponse } from "@/lib/response/ApiResponse";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";

export async function addTodo(content: string, userId?: string) {
  try {
    const result = await db.user.update({
      where: {
        id: userId || testUserId,
      },
      data: {
        Todo: {
          create: {
            content: content,
            finished: false,
          },
        },
      },
    });

    return actionResponse.success();
  } catch (error) {
    const errorMessage = "Add todo failed! " + error;
    logger.error(errorMessage);
    return actionResponse.error(errorMessage);
  }
}

export async function updateTodo({
  todoId,
  finished,
  content,
}: {
  todoId: number;
  finished?: boolean;
  content?: string;
}) {
  try {
    const data = {} as any;
    finished !== undefined && (data.finished = finished);
    content !== undefined && (data.content = content);
    const res = await db.todo.update({
      where: {
        id: todoId,
      },
      data: {
        ...data,
      },
    });
    if (!res) {
      return actionResponse.error("Todo not found!");
    }
    return actionResponse.success({ id: data.id });
  } catch (error) {
    const errorMessage = "Update todo failed! " + error;
    logger.error(errorMessage);
    return actionResponse.error(errorMessage);
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
      return actionResponse.error("Todo not found!");
    }
    return actionResponse.success({ todoId });
  } catch (error) {
    const errorMessage = "Delete todo failed! " + error;
    logger.error(errorMessage);
    return actionResponse.error(errorMessage);
  }
}

export async function getTodoList(userId?: string) {
  try {
    const res = await db.todo.findMany({
      where: {
        userId: userId || testUserId,
      },
    });
    return actionResponse.success({
      todoList: res,
      total: res.length,
      finished: res.filter((todo) => todo.finished).length,
    });
  } catch (error) {
    const errorMessage = "Query todo list failed! " + error;
    logger.error(errorMessage);
    return actionResponse.error(errorMessage);
  }
}

export async function getTodoById(todoId: number, userId?: string) {
  try {
    const res = await db.todo.findFirst({
      where: {
        id: todoId,
        userId: userId || testUserId,
      },
    });

    return actionResponse.success({ todo: res });
  } catch (error) {
    const errorMessage = "Get todo failed!";
    logger.error(errorMessage);
    return actionResponse.error(errorMessage);
  }
}
