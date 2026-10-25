"use client";
import { useState } from "react";

import { StyledLink } from "@/components/ui/styled-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const UserMenu = ({ prefetch }: { prefetch?: boolean }) => {
  const { logout, user, authUnavailable } = useAuth();
  const [error, setError] = useState("");
  if (authUnavailable || error) return <div><span role="alert">{error || "身份暂时不可用，请稍后重试"}</span><StyledLink href="/profile">重试或本地退出</StyledLink></div>;

  if (!user) {
    return (
      <StyledLink href="/login" prefetch={prefetch}>
        登录
      </StyledLink>
    );
  }
  return (
    <div className="flex items-center gap-3"><StyledLink href="/profile">{user.authMode === "legacy" ? "绑定用户中心" : "账号与安全"}</StyledLink><Button
      materialIcon="person"
      className="profile-container m-0! text-center flex items-center gap-1"
      onClick={async () => { try { await logout(); } catch { setError("退出失败，请稍后重试"); } }}
    >
      <span>{user.username}</span>
    </Button></div>
  );
};
