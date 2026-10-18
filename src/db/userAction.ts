import db from "@/db/client";

const checkUser = async (identifier: "id" | "email", payload: string, password = false) => {
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
      createdAt: true,
      password,
      authMode: true,
      authVersion: true,
    },
  });
  return user;
};

export { checkUser };
