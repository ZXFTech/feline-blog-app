import React from "react";
import NeuButton from "../NeuButton/neuButton";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import NeuDiv from "../NeuDiv/NeuDiv";
import Icon from "../Icon/icon";

export const UserMenu = async () => {
  // 检查当前用户是否存在
  const user = await getCurrentUser();
  // 存在则显示用户基本信息

  // 不存在则显示登录注册按钮
  if (!user) {
    return (
      <NeuButton buttonType="link" href="/login">
        登录/注册
      </NeuButton>
    );
  }

  return (
    <NeuDiv className="profile-container m-0! text-center flex items-center w-fit gap-1">
      {user.avatar || <Icon icon="person" />}
      <span>{user.username}</span>
      {/* <NeuDiv className="m-0!"></NeuDiv> */}
    </NeuDiv>
  );
};
