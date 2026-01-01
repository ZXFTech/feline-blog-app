import { checkUser } from "@/db/userAction";
import { verifyToken } from "@/lib/jwt";
import logger from "@/lib/logger/Logger";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("密码至少需要8个字符");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("密码必须包含至少一个大写字母");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("密码必须包含至少一个小写字母");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("密码必须包含至少一个数字");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      return null;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return null;
    }

    const user = await checkUser("id", decoded.userId);

    return user;
  } catch (error) {
    logger.error("获取当前用户错误:", error);
    return null;
  }
}

export async function requireAuth(handler: CallableFunction) {
  return async function (context: unknown) {
    const user = await getCurrentUser();

    if (!user) {
      return {
        redirect: {
          destination: "/login",
          permanent: false,
        },
      };
    }

    return handler(context, user);
  };
}

export function requireRole(roles: string[]) {
  return function (handler: CallableFunction) {
    return async function (context: unknown) {
      const user = await getCurrentUser();

      if (!user) {
        return {
          redirect: {
            destination: "/login",
            permanent: false,
          },
        };
      }

      if (!roles.includes(user.role)) {
        return {
          redirect: {
            destination: "/unauthorized",
            permanent: false,
          },
        };
      }

      return handler(context, user);
    };
  };
}
