"use server";

import { PromptObj } from "@/app/formatter/page";
import db from "./client";

type ImgPlatform = "midjourney";

export async function savePrompt(
  promptList: PromptObj[],
  platform: ImgPlatform,
) {
  // 先只批量创建
  await db.prompt.createMany({
    data: promptList.map((item) => ({
      originId: item.id,
      content: item.content,
      platform: platform,
      marks: item.mark,
    })),
  });
}
