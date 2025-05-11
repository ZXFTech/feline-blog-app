"use server";

import { actionResponse } from "@/lib/response/ApiResponse";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";
export async function createBlog({
  title,
  content,
  authorId,
}: {
  title: string;
  content: string;
  authorId?: string;
}) {
  try {
    const res = await db.blog.create({
      data: {
        title,
        content: content,
        authorId: authorId || testUserId,
      },
    });
    return actionResponse.success({ blogId: res.id });
  } catch (err) {
    logger.error("Create blog failed!", err);
    return actionResponse.error("Create blog failed!" + err);
  }
}

export async function getBlogById(blogId: number) {
  try {
    const res = await db.blog.findFirst({
      where: {
        id: Number(blogId),
      },
      include: {
        TagsOnBlog: true,
        author: true,
      },
    });
    return { data: { blog: res }, error: false, message: "" };
    // return actionResponse.success({ blog: res });
  } catch (err) {
    logger.error("Find blog failed!", err);
    return actionResponse.error("Find blog failed!" + err);
  }
}

export async function updateBlogById(
  blogId: number,
  { title, content }: { title: string; content: string }
) {
  try {
    const res = await db.blog.update({
      where: {
        id: Number(blogId),
      },
      data: {
        title,
        content: content,
      },
    });
    return actionResponse.success({ blogId: res.id });
  } catch (err) {
    logger.error("Update blog failed!", err);
    return actionResponse.error("Update blog failed!" + err);
  }
}

export async function getBlogList(
  pageNum: number,
  pageSize: number,
  userId?: string
) {
  try {
    const [blogs, total] = await db.$transaction([
      db.blog.findMany({
        where: {
          authorId: userId,
          delete: false,
        },
        orderBy: {
          createdAt: "desc",
        },
        include: {
          author: true,
        },
        take: pageSize,
        skip: (pageNum - 1) * pageSize,
      }),
      db.blog.count({
        where: { authorId: userId || testUserId },
      }),
    ]);
    return actionResponse.success({
      blogs: blogs,
      pageBean: { pageNum, pageSize },
      total,
    });
  } catch (err) {
    logger.error("err", err);
    return actionResponse.error("Query blog list failed!" + err);
  }
}
