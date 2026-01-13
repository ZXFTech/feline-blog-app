"use server";

import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";
import { Tag, Todo } from "../../generated/prisma/client";
import { TodoSearchParams } from "@/types/todo";
import { requireAuth } from "@/lib/auth/userAuth";

export async function getTodoList(
  searchParams?: TodoSearchParams,
  userId?: string
) {
  try {
    const { finished, content, tags, orderBy } = searchParams || {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      userId: userId || testUserId,
      delete: false,
    };

    if (finished !== null) {
      where["finished"] = finished;
    }

    if (content && content.trim() !== "") {
      where.content = {
        contains: content,
      };
    }

    const [todos, total, finishedTodos] = await db.$transaction([
      db.todo.findMany({
        where: where,
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
        orderBy: {
          createAt: orderBy,
        },
      }),
      db.todo.count({
        where: { userId },
      }),
      db.todo.count({
        where: {
          userId,
          finished: true,
        },
      }),
    ]);

    return {
      todoList: todos,
      total,
      finished: finishedTodos,
    };
  } catch (error) {
    const errorMessage = "Query todo list failed! " + error;
    logger.error(errorMessage);
    throw errorMessage;
  }
}

export async function addTodo({
  content,
  tags = [],
}: {
  content: string;
  tags?: Tag[];
}) {
  try {
    const user = await requireAuth();
    const userId = user.id;
    // 先处理所有 tags
    const tagOperation = tags.map((tag) =>
      db.tag.upsert({
        where: {
          userId_content: {
            userId,
            content: tag.content,
          },
        },
        update: {
          color: tag.color,
        },
        create: {
          content: tag.content,
          color: tag.color,
          userId,
        },
      })
    );

    const tagResult = await Promise.all(tagOperation);

    const result = await db.todo.create({
      data: {
        content: content,
        finished: false,
        userId,
        tags: {
          create: tagResult.map((tag) => ({
            assignedBy: userId,
            assignedAt: new Date(),
            tag: {
              connect: {
                id: tag.id,
              },
            },
          })),
        },
      },
      include: {
        tags: true,
      },
    });

    return { result };
  } catch (error) {
    const errorMessage = "Add todo failed! " + error;
    logger.error(errorMessage);
    throw errorMessage;
  }
}

export async function updateTodo({
  id,
  finished,
  content,
  tags,
}: {
  id: number;
  finished?: boolean;
  content?: string;
  tags?: Tag[];
}) {
  try {
    const user = await requireAuth();
    const userId = user.id;
    const data = {} as Todo;
    if (finished !== undefined) data.finished = finished;
    if (content !== undefined) data.content = content;

    let res;
    // 如果 tag 不为 undefined, 先更新 tags
    if (tags !== undefined) {
      const tagOperation = tags.map((tag) =>
        db.tag.upsert({
          where: {
            userId_content: {
              userId,
              content: tag.content,
            },
          },
          update: {
            color: tag.color,
          },
          create: {
            content: tag.content,
            color: tag.color,
            userId,
          },
        })
      );
      const tagResult = await Promise.all(tagOperation);
      res = await db.todo.update({
        where: {
          id: id,
        },
        data: {
          ...data,
          tags: {
            deleteMany: {},
            create: tagResult?.map((tag) => ({
              assignedBy: userId,
              assignedAt: new Date(),
              tag: {
                connect: {
                  id: tag.id,
                },
              },
            })),
          },
        },
      });
    } else {
      res = await db.todo.update({
        where: {
          id,
        },
        data: {
          ...data,
        },
      });
    }
    if (!res) {
      throw "Todo not found!";
    }
    return { id: data.id };
  } catch (error) {
    const errorMessage = "Update todo failed! " + error;
    logger.error(errorMessage);
    throw errorMessage;
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
      throw "Todo not found!";
    }
    return { todoId };
  } catch (error) {
    const errorMessage = "Delete todo failed! " + error;
    logger.error(errorMessage);
    throw errorMessage;
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

    return { todo: res };
  } catch (error) {
    const errorMessage = "Get todo failed! " + error;
    logger.error(errorMessage);
    throw errorMessage;
  }
}
