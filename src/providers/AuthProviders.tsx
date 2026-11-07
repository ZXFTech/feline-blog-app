"use client";

import React, { createContext, ReactNode, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { Role } from "../../generated/prisma-postgres/enums";
import type { PublicConfig } from "@user-center/next-better-auth/public";

export interface CtxUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  avatar?: string | null;
  authMode?: string;
}

type AuthContextType = {
  authEnabled: boolean;
  user: CtxUser | null;
  setUser: (u: CtxUser | null) => void;
  authUnavailable: boolean;
  setAuthUnavailable: (value: boolean) => void;
  publicConfig: PublicConfig | null;
};

const authCtx = createContext<AuthContextType | null>(null);

function AuthProviders({
  children,
  initialUser,
  publicConfig = null,
  initialUnavailable = false,
}: {
  children: ReactNode;
  initialUser: CtxUser | null;
  publicConfig?: PublicConfig | null;
  initialUnavailable?: boolean;
}) {
  const pathname = usePathname();
  const authEnabled = pathname !== "/album";
  const [sessionUser, setUser] = useState<CtxUser | null>(initialUser);
  const [authUnavailable, setAuthUnavailable] = useState(initialUnavailable);
  const user = authEnabled ? sessionUser : null;

  const Provider = authCtx.Provider;

  return (
    <Provider
      value={{
        authEnabled,
        user,
        setUser,
        authUnavailable,
        setAuthUnavailable,
        publicConfig,
      }}
    >
      {children}
    </Provider>
  );
}

export const useCtxAuth = () => {
  const ctx = useContext(authCtx);
  if (!ctx) {
    throw "auth ctx 未找到, 请在 AuthProvider 组件内使用";
  }
  return ctx;
};

export default AuthProviders;
