import { NextRequest } from 'next/server';
import db from '@/db/client';
import { hashPassword, validateEmail, validatePassword } from '@/utils/auth';
import { generateToken } from '@/lib/jwt';
import { actionResponse } from '@/lib/response/ApiResponse';
import { checkUser } from '@/db/userAction';
import logger from '@/lib/logger/Logger';
import { isKnownPrismaError, safeErrorContext } from '@/lib/server/error';
import { parseString } from '@/lib/server/validation';

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object') {
      return actionResponse.error('请填写所有必填字段', 400);
    }
    const input = body as Record<string, unknown>;
    const email = parseString(input.email, { label: '邮箱', max: 254 })?.toLowerCase();
    const password = parseString(input.password, { label: '密码', max: 128, trim: false });
    const username = parseString(input.username, { label: '用户名', max: 50 });
    if (!email || !password || !username) return actionResponse.error('请填写有效的必填字段', 400);

    if (!validateEmail(email)) {
      return actionResponse.error('邮箱格式不正确', 400);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return actionResponse.error(passwordValidation.errors.join('；'), 400);
    }

    const existingUser = await checkUser('email', email);

    if (existingUser) {
      return actionResponse.error('该邮箱已经被注册', 409);
    }

    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email,
        password: hashedPassword,
        username,
        role: 'USER',
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
          avatar: user.avatar,
        },
      },
      '注册成功'
    );

    // 设置 cookie
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return actionResponse.error('请求内容不是有效的 JSON', 400);
    }
    if (isKnownPrismaError(error, 'P2002')) return actionResponse.error('该邮箱已经被注册', 409);
    logger.error(safeErrorContext('register', error));
    return actionResponse.error();
  }
}
