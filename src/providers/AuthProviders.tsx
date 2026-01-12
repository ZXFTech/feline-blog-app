"use client";

import React, { createContext, ReactNode, useContext, useState } from "react";
import { Role } from "../../generated/prisma/enums";

interface CtxUser {
  username: string;
  email: string;
  role: Role;
  avatar?: string;
}

type AuthContextType = {
  user: CtxUser | null;
  setUser: (u: CtxUser | null) => void;
};

const authCtx = createContext<AuthContextType | null>(null);

function AuthProviders({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CtxUser | null>(null);

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
