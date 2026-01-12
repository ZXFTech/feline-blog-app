"use client";

import React from "react";
import NeuButton from "../NeuButton/neuButton";
import Icon from "../Icon/icon";
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
      className="profile-container m-0! text-center flex items-center w-fit gap-1"
      onClick={logout}
    >
      {user.avatar || <Icon icon="person" />}
      <span>{user.username}</span>
    </NeuButton>
  );
};
