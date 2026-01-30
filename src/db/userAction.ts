"use server";

import db from "./client";

const checkUser = async (
  identifier: "id" | "email",
  payload: string,
  password = false,
) => {
  const user = await db.user.findFirst({
    where: {
      [identifier]: payload,
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      avatar: true,
      password,
    },
  });
  if (!user) {
    throw "用户不存在";
  }
  return user;
};

export { checkUser };
