"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger/Logger";
import { useCtxAuth } from "@/providers/AuthProviders";

export function useAuth() {
  const router = useRouter();
  const { authEnabled, setUser, user, authUnavailable, setAuthUnavailable } = useCtxAuth();
  const [authLoading, setAuthLoading] = useState(authEnabled);

  useEffect(() => {
    if (!authEnabled) {
      setAuthLoading(false);
      return;
    }

    setAuthLoading(true);
    const checkAuth = async function () {
      try {
        const res = await fetch("/api/auth/me");

        if (res.ok) {
          setAuthUnavailable(false);
          const { data } = await res.json();
          setUser(data?.user ?? null);
        } else {
          setAuthUnavailable(res.status === 503);
          setUser(null);
        }
      } catch {
        setAuthUnavailable(true);
        logger.error({ operation: "authSessionRead", code: "AUTH_UNAVAILABLE" });
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [authEnabled, setUser, setAuthUnavailable]);

  const login = async function (email: string, password: string) {
    try {
      const csrf = await fetch("/api/auth/csrf").then(response => response.json());
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, csrfToken: csrf.data?.csrfToken }),
      });

      const { data, message } = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, message: message };
      }
    } catch (error) {
      logger.error("网络错误.", error);
      return { success: false, message: "网络错误" };
    }
  };

  const logout = async function () {
    try {
      const csrfResponse = await fetch("/api/auth/csrf");
      const csrf = await csrfResponse.json();
      if (!csrfResponse.ok) throw new Error(csrf.message);
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csrfToken: csrf.data.csrfToken }),
      });
      if (!response.ok) throw new Error((await response.json()).message);
      setUser(null);
      setAuthUnavailable(false);
      router.push("/login");
    } catch (error) {
      setAuthUnavailable(true);
      throw error;
    }
  };

  return {
    user,
    authLoading,
    authUnavailable,
    login,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === "ADMIN",
    isRoot: user?.role === "ROOT",
  };
}
