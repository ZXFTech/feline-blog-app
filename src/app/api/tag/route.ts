import { getAllTags, getSortedTags } from "@/db/tagAction";
import logger from "@/lib/logger/Logger";
import { actionResponse } from "@/lib/response/ApiResponse";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    console.log("params", params);
    const countBy = params.get("countBy");
    if (countBy !== "blogs" && countBy !== "todos") {
      return actionResponse.error("countBy 参数必须为 blogs 或者 todos");
    }
    if (!params) {
      const result = await getAllTags();
      return actionResponse.success({ ...result });
    } else {
      const result = await getSortedTags(
        params.get("countBy") as "todos" | "blogs",
        params.get("orderBy") as "desc" | "asc"
      );
      return actionResponse.success({ ...result });
    }
  } catch (error) {
    logger.error("出现错误,", error);
    return actionResponse.error("内部错误");
  }
}
