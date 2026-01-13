import { CountedTag } from "@/app/tag/page";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";

export async function getAllTags(
  countBy: "blogs" | "todos",
  sort?: "desc" | "asc"
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
