"use server";

import { ApiResponse } from "@/lib/response/ApiResponse";
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
    return ApiResponse.success({ blogId: res.id });
  } catch (err) {
    logger.error("Create blog failed!", err);
    return ApiResponse.error("Create blog failed!" + err);
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
    return ApiResponse.success({ blog: res });
  } catch (err) {
    logger.error("Find blog failed!", err);
    return ApiResponse.error("Find blog failed!" + err);
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
    return ApiResponse.success({ blogId: res.id });
  } catch (err) {
    logger.error("Update blog failed!", err);
    return ApiResponse.error("Update blog failed!" + err);
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
    return ApiResponse.success({
      blogs: blogs,
      pageBean: { pageNum, pageSize },
      total,
    });
  } catch (err) {
    logger.error("err", err);
    return ApiResponse.error("Query blog list failed!" + err);
  }
}
