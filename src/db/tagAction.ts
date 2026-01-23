"use server";

import { CountedTag } from "@/app/tag/page";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";

export async function getAllTags() {
  try {
    // const user = await requireAuth();

    const result = await db.tag.findMany({
      where: {
        userId: testUserId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return result;
  } catch (error) {
    logger.error("获取 tag 列表出错,", error);
    throw error;
  }
}

export async function getOptionTagsById(target: "blog" | "todo", id?: number) {
  try {
    if (!id) {
      // 没有 todo id 返回所有 tag
      return await getAllTags();
    }

    const result = await db.tag.findMany({
      where: {
        userId: testUserId,
        [target + "s"]: {
          none: {
            [target + "Id"]: id,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return result;
  } catch (error) {
    logger.error("获取可选 tags 出错,", error);
    throw error;
  }
}

export async function getSortedTags(
  countBy: "blogs" | "todos",
  sort?: "desc" | "asc",
) {
  try {
    // const user = await requireAuth();
    if (countBy !== "blogs" && countBy !== "todos") {
      return { tags: [], max: 0 };
    }
    const orderBy = {
      [countBy]: {
        _count: sort || "desc",
      },
    };
    const include = {
      _count: {
        select: {
          [countBy]: true,
        },
      },
    };

    const result = await db.tag.findMany({
      where: {
        userId: testUserId,
      },
      orderBy,
      include,
    });
    let max = 0;
    const filteredResult: CountedTag[] = result
      .filter((tag) => {
        return tag._count[countBy] !== 0;
      })
      .map((tag) => {
        const _count = tag._count[countBy] || 0;
        max = max > _count ? max : _count;
        return {
          ...tag,
          count: _count,
        };
      });

    return { tags: filteredResult, max };
  } catch (error) {
    logger.error("获取 tag 列表出错,", error);
    throw error;
  }
}
