import db from "@/db/client";
import { checkUser } from "@/db/userAction";
import { verifyToken } from "@/lib/jwt";
import logger from "@/lib/logger/Logger";
import { actionResponse } from "@/lib/response/ApiResponse";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const token = await request.cookies.get("token")?.value;

    if (!token) {
      return actionResponse.success(null, "");
    }

    const decode = verifyToken(token);

    if (!decode) {
      return actionResponse.success(null, "");
    }

    const user = await db.user.findUnique({
      where: {
        id: decode.userId,
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });

    return actionResponse.success({ user });
  } catch (error) {
    logger.error("获取用户信息错误." + error);
    return actionResponse.error();
  }
}
