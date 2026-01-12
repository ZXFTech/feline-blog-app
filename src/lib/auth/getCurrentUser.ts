import { cookies } from "next/headers";
import { verifyToken } from "../jwt";
import { checkUser } from "@/db/userAction";
import logger from "../logger/Logger";

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
