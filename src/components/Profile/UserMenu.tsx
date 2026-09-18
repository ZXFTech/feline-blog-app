"use client";

import { StyledLink } from "@/components/ui/styled-link";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const UserMenu = () => {
  const { logout, user } = useAuth();

  if (!user) {
    return <StyledLink href="/login">登录/注册</StyledLink>;
  }
  return (
    <Button
      materialIcon="person"
      className="profile-container m-0! text-center flex items-center gap-1"
      onClick={logout}
    >
      <span>{user.username}</span>
    </Button>
  );
};
