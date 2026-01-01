import { checkUser } from "@/db/userAction";
import { generateToken } from "@/lib/jwt";
import logger from "@/lib/logger/Logger";
import { actionResponse } from "@/lib/response/ApiResponse";
import { verifyPassword } from "@/utils/auth";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return actionResponse.error("邮箱和密码不能为空", 400);
    }

    const user = await checkUser("email", email);

    if (!user || !user.password) {
      return actionResponse.error("邮箱或密码不正确", 401);
    }

    const isValidatePassword = await verifyPassword(password, user.password);

    if (!isValidatePassword) {
      return actionResponse.error("邮箱或密码不正确", 401);
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const response = actionResponse.success(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.username,
          role: user.role,
        },
      },
      "登录成功",
      200
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    logger.error("登录错误:", error);
    return actionResponse.error();
  }
}
