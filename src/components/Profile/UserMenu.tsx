"use client";
import { useState } from "react";

import { StyledLink } from "@/components/ui/styled-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const UserMenu = ({ prefetch }: { prefetch?: boolean }) => {
  const { authEnabled, logout, retry, user, authUnavailable, authLoading, canSignOut } = useAuth();
  const [error, setError] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);
  async function signOut() {
    setLogoutPending(true);
    setError("");
    try {
      await logout();
    } catch {
      setError("退出尚未确认，请重新核验会话状态");
    } finally {
      setLogoutPending(false);
    }
  }
  if (authEnabled === false)
    return (
      <StyledLink href="/profile" prefetch={prefetch}>
        账号与安全
      </StyledLink>
    );

  if (authUnavailable || error)
    return (
      <div className="flex flex-col gap-2">
        <span role="alert">
          {error ||
            (canSignOut ? "身份暂时不可用，请稍后重试" : "认证配置暂时不可用，请联系维护者")}
        </span>
        <div className="flex items-center gap-3">
          <Button
            loading={authLoading}
            onClick={() => {
              setError("");
              retry();
            }}
          >
            重新核验
          </Button>
          {canSignOut ? (
            <Button loading={logoutPending} onClick={signOut}>
              退出当前平台
            </Button>
          ) : null}
        </div>
      </div>
    );

  if (!user) {
    return (
      <StyledLink href="/login" prefetch={prefetch}>
        登录
      </StyledLink>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <StyledLink href="/profile">账号与安全</StyledLink>
      <Button
        materialIcon="person"
        className="profile-container m-0! text-center flex items-center gap-1"
        loading={logoutPending}
        onClick={signOut}
      >
        <span>{user.username}</span>
      </Button>
    </div>
  );
};
