"use client";

import React, { createContext, ReactNode, useContext, useState } from "react";
import { Role } from "../../generated/prisma/enums";

export interface CtxUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  avatar?: string | null;
}

type AuthContextType = {
  user: CtxUser | null;
  setUser: (u: CtxUser | null) => void;
};

const authCtx = createContext<AuthContextType | null>(null);

function AuthProviders({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: CtxUser | null;
}) {
  const [user, setUser] = useState<CtxUser | null>(initialUser);

  const Provider = authCtx.Provider;

  return (
    <Provider
      value={{
        user,
        setUser,
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
