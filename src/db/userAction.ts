"use server";

import { actionResponse } from "@/lib/response/ApiResponse";
import db, { testUserId } from "./client";
import logger from "@/lib/logger/Logger";

const checkUser = async (identifier: "userId" | "email", payload: string) => {
  const user = await db.user.findFirst({
    where: {
      [identifier]: payload,
    },
  });
  return user;
};

export { checkUser };
