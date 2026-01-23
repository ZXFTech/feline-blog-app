"use client";

import { useAuth } from "@/hooks/useAuth";
import { ReactNode, useEffect } from "react";
import { toast as message } from "@/components/ProMessage";
import { useRouter } from "next/navigation";

interface Props {
  children: ReactNode;
  requiredRole?: string[];
}

export const ProtectRoute = ({ children, requiredRole }: Props) => {
  const { authLoading, isAuthenticated, user } = useAuth();

  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      message.warning("未登录或登录过期, 请先登录.");
      router.push("/login");
    }

    if (!authLoading && isAuthenticated && requiredRole) {
      const hasRequiredRole = requiredRole.includes(user!.role);
      if (!hasRequiredRole) {
        router.push("/unauthorized");
      }
    }
  }, [authLoading, isAuthenticated, user, router, requiredRole]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (requiredRole && requiredRole.includes(user!.role)) {
    return null;
  }

  return <>{children}</>;
};
