import { checkUser } from '@/db/userAction';
import { generateToken } from '@/lib/jwt';
import logger from '@/lib/logger/Logger';
import { actionResponse } from '@/lib/response/ApiResponse';
import { validateEmail, verifyPassword } from '@/utils/auth';
import { NextRequest } from 'next/server';
import { safeErrorContext } from '@/lib/server/error';
import { parseString } from '@/lib/server/validation';

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object') {
      return actionResponse.error('邮箱和密码不能为空', 400);
    }
    const input = body as Record<string, unknown>;
    const email = parseString(input.email, { label: '邮箱', max: 254 })?.toLowerCase();
    const password = parseString(input.password, { label: '密码', max: 128, trim: false });
    if (!email || !password || !validateEmail(email))
      return actionResponse.error('邮箱或密码格式不正确', 400);

    const user = await checkUser('email', email, true);

    if (!user || !user.password) {
      return actionResponse.error('邮箱或密码不正确', 401);
    }

    const isValidatePassword = await verifyPassword(password, user.password);

    if (!isValidatePassword) {
      return actionResponse.error('邮箱或密码不正确', 401);
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
          username: user.username,
          role: user.role,
          avatar: user.avatar,
        },
      },
      '登录成功'
    );

    const isProd = process.env.NODE_ENV === 'production';

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return actionResponse.error('请求内容不是有效的 JSON', 400);
    }
    logger.error(safeErrorContext('login', error));
    return actionResponse.error();
  }
}
