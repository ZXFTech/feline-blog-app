import { verifyToken } from "../jwt";
import { checkUser } from "@/db/userAction";
import logger from "../logger/Logger";
import { getCookieData } from "../cookieStore";

export async function getCurrentUser() {
  try {
    const cookieToken = await getCookieData("token");
    const token = cookieToken?.value;

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

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw "用户未登录";
  }
  return user;
}
