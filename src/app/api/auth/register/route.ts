import { NextRequest, NextResponse } from "next/server";
import db from "@/db/client";
import { hashPassword, validateEmail, validatePassword } from "@/utils/auth";
import { generateToken } from "@/lib/jwt";
import { actionResponse } from "@/lib/response/ApiResponse";
import { checkUser } from "@/db/userAction";
import logger from "@/lib/logger/Logger";

export async function POST(req: NextRequest) {
  try {
    const { email, password, username } = await req.json();

    if (!email || !password || !username) {
      return actionResponse.error("请填写所有必填字段", 400);
    }

    if (!validateEmail) {
      return NextResponse.json({ error: "邮箱格式不正确!" }, { status: 400 });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return actionResponse.error(
        "密码不符合要求" + passwordValidation.errors,
        400
      );
    }

    const existingUser = await checkUser("email", email);

    if (existingUser) {
      return actionResponse.error("该邮箱已经被注册", 409);
    }

    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        role: "USER",
      },
    });

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
          username: user.username,
          role: user.role,
        },
      },
      "注册成功"
    );

    // 设置 cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    logger.error("注册错误:", error);
    return actionResponse.error();
  }
}
