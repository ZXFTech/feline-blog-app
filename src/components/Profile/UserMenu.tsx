"use client";

import React from "react";
import NeuButton from "../NeuButton";
import { useAuth } from "@/hooks/useAuth";
import { useCtxAuth } from "@/providers/AuthProviders";

export const UserMenu = () => {
  const { user } = useCtxAuth();
  const { logout } = useAuth();
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
      onClick={logout}
    >
      <span>{user.username}</span>
    </NeuButton>
  );
};
