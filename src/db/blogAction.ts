"use server";

import { actionResponse } from "@/lib/response/ApiResponse";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";
import { checkUser } from "./userAction";
import { TagData } from "@/components/TagEditor";

export async function createBlog({
  title,
  content,
  authorId = testUserId,
  tags = [],
}: {
  title: string;
  content: string;
  authorId?: string;
  tags?: TagData[];
}) {
  try {
    const existingUser = await checkUser("userId", authorId);
    if (!existingUser) {
      return actionResponse.error("用户不存在!");
    }

    //检查所有 tags
    const tagOperation = tags.map((tag) => {
      return db.tag.upsert({
        where: {
          userId_content: {
            userId: authorId,
            content: tag.content,
          },
        },
        update: {
          color: tag.color,
        },
        create: {
          userId: authorId,
          content: tag.content,
          color: tag.color,
        },
      });
    });

    const tagResult = await Promise.all(tagOperation);

    const res = await db.blog.create({
      data: {
        title,
        content,
        authorId,
        tags: {
          create: tagResult.map((tag) => ({
            assignedAt: new Date(),
            assignedBy: authorId,
            tag: {
              connect: { id: tag.id },
            },
          })),
        },
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
        author: true,
        tags: {
          include: {
            tag: true,
          },
        },
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
  {
    title,
    content,
    tags,
    userId,
  }: { title: string; content: string; tags: TagData[]; userId: string }
) {
  try {
    const tagOperation = tags.map((tag) =>
      db.tag.upsert({
        where: {
          content: tag.content,
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
    const res = await db.blog.update({
      where: {
        id: Number(blogId),
      },
      data: {
        title,
        content: content,
        tags: {
          deleteMany: {},
          create: tagResult.map((item) => ({
            assignedAt: new Date(),
            assignedBy: userId,
            tag: {
              connect: {
                id: item.id,
              },
            },
          })),
        },
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
  searchParams: {
    content: string;
    orderBy: "desc" | "asc";
  },
  userId = testUserId
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      authorId: userId,
      delete: false,
    };

    if (searchParams.content) {
      where.content = {
        contains: searchParams.content,
      };
    }

    const [blogs, total] = await db.$transaction([
      db.blog.findMany({
        where,
        orderBy: {
          createdAt: searchParams.orderBy,
        },
        include: {
          author: true,
        },
        take: pageSize,
        skip: (pageNum - 1) * pageSize,
      }),
      db.blog.count({
        where: { authorId: userId },
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
