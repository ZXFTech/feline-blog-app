"use server";

import db from "./client";

const checkUser = async (identifier: "id" | "email", payload: string) => {
  const user = await db.user.findFirst({
    where: {
      [identifier]: payload,
    },
  });
  return user;
};

export { checkUser };
