"use server";

import { actionResponse } from "@/lib/response/ApiResponse";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";

const checkUser = async (userId: string) => {
  const user = await db.user.findFirst({
    where: {
      id: userId || testUserId,
    },
  });
  if (!user) {
    logger.error("User does not exist!");
    return actionResponse.error("User does not exist!");
  }
  return actionResponse.success();
};

export { checkUser };
