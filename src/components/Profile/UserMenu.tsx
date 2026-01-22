"use client";

import NeuButton from "../NeuButton";
import { useCtxAuth } from "@/providers/AuthProviders";
import { useRouter } from "next/navigation";

export const UserMenu = () => {
  const { user } = useCtxAuth();
  const router = useRouter();
  if (!user) {
    return (
      <NeuButton buttonType="link" href="/login">
        登录/注册
      </NeuButton>
    );
  }
  return (
    <NeuButton
      icon="person"
      className="profile-container m-0! text-center flex items-center gap-1"
      // onClick={logout}
      onClick={() => router.push("/daily")}
    >
      <span>{user.username}</span>
    </NeuButton>
  );
};
