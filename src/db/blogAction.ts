"use server";

import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";
import { TagData } from "@/components/TagEditor";
import { getCurrentUser, requireAuth } from "@/lib/auth/userAuth";
import { Role } from "../../generated/prisma/enums";

export async function createBlog({
  title,
  content,
  tags = [],
}: {
  title: string;
  content: string;
  tags?: TagData[];
}) {
  try {
    const existingUser = await getCurrentUser();
    if (!existingUser) {
      throw "用户不存在!";
    }

    if (existingUser.role !== Role.ROOT) {
      throw "无权限!";
    }
    const authorId = existingUser.id;

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
    return { blogId: res.id };
  } catch (err) {
    logger.error("Create blog failed!", err);
    throw "Create blog failed!" + err;
  }
}

export async function getBlogById(id: number) {
  try {
    // const user = await requireAuth();
    const userId = testUserId;
    const blogId = Number(id);
    const [blog, isLiked, isFavorite] = await db.$transaction([
      db.blog.findFirst({
        where: {
          id: blogId,
        },
        include: {
          author: true,
          tags: {
            include: {
              tag: true,
            },
          },
        },
      }),
      db.blogLike.findUnique({
        where: {
          blogId_userId: {
            userId,
            blogId,
          },
        },
      }),
      db.blogFavorite.findUnique({
        where: {
          blogId_userId: {
            userId,
            blogId,
          },
        },
      }),
    ]);
    return { blog, isLiked: !!isLiked, isFavorite: !!isFavorite };
  } catch (err) {
    logger.error("Find blog failed!", err);
    throw err;
  }
}

export async function updateBlogById(
  blogId: number,
  { title, content, tags }: { title: string; content: string; tags: TagData[] },
) {
  try {
    const existingUser = await getCurrentUser();
    if (!existingUser) {
      throw "用户不存在!";
    }

    if (existingUser.role !== Role.ROOT) {
      throw "无权限!";
    }
    const authorId = existingUser.id;
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
          userId: authorId,
        },
      }),
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
            assignedBy: authorId,
            tag: {
              connect: {
                id: item.id,
              },
            },
          })),
        },
      },
    });
    return { blogId: res.id };
  } catch (err) {
    logger.error("Update blog failed!", err);
    throw "Update blog failed!" + err;
  }
}

export async function getBlogList(
  pageNum: number,
  pageSize: number,
  searchParams: {
    content?: string;
    orderBy: "desc" | "asc";
  },
  userId = testUserId, // 仅查询个人的
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
          tags: {
            include: {
              tag: true,
            },
          },
        },
        take: pageSize,
        skip: (pageNum - 1) * pageSize,
      }),
      db.blog.count({
        where: { authorId: userId },
      }),
    ]);
    return {
      blogs: blogs,
      pageBean: { pageNum, pageSize },
      total,
    };
  } catch (err) {
    logger.error("err", err);
    throw "Query blog list failed!" + err;
  }
}

export async function getAdjacentBlogs(blogId: number) {
  const current = await db.blog.findUnique({
    where: {
      id: blogId,
    },
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (!current) {
    return { prev: null, next: null };
  }

  const [prev, next] = await db.$transaction([
    db.blog.findFirst({
      where: {
        createdAt: { lt: current.createdAt },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        title: true,
        id: true,
        createdAt: true,
      },
    }),
    db.blog.findFirst({
      where: {
        createdAt: { gt: current.createdAt },
      },
      select: {
        title: true,
        id: true,
        createdAt: true,
      },
    }),
  ]);

  return { prev, next };
}

// 点赞
export async function likeBlog(blogId: number, like = true) {
  try {
    const user = await requireAuth();
    const userId = user.id;

    if (like) {
      // 点赞
      await db.$transaction([
        db.blogLike.create({
          data: {
            blogId,
            userId,
          },
        }),
        db.blog.update({
          where: {
            id: blogId,
          },
          data: {
            likeCount: { increment: 1 },
          },
        }),
      ]);
      return;
    }
    // 取消点赞
    await db.$transaction([
      db.blogLike.delete({
        where: {
          blogId_userId: {
            blogId,
            userId,
          },
        },
      }),
      db.blog.update({
        where: {
          id: blogId,
        },
        data: {
          likeCount: { decrement: 1 },
        },
      }),
    ]);
  } catch (error) {
    logger.error(`${like && "取消"}点赞失败,`, error);
    throw error;
  }
}

// 收藏
export async function favoriteBlog(blogId: number, favorite: boolean) {
  try {
    const user = await requireAuth();
    const userId = user.id;
    if (favorite) {
      await db.$transaction([
        db.blogFavorite.create({
          data: {
            blogId,
            userId,
          },
        }),
        db.blog.update({
          where: {
            id: blogId,
          },
          data: {
            favoriteCount: { increment: 1 },
          },
        }),
      ]);
      return;
    }
    // 取消收藏
    await db.$transaction([
      db.blogFavorite.delete({
        where: {
          blogId_userId: {
            blogId,
            userId,
          },
        },
      }),
      db.blog.update({
        where: {
          id: blogId,
        },
        data: {
          favoriteCount: { decrement: 1 },
        },
      }),
    ]);
  } catch (error) {
    logger.error(`${favorite && "取消"}收藏失败,`, error);
    throw error;
  }
}
