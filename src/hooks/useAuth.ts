"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger/Logger";
import { useCtxAuth } from "@/providers/AuthProviders";

export function useAuth() {
  const [authLoading, setAuthLoading] = useState(true);

  const router = useRouter();
  const { setUser, user } = useCtxAuth();

  const checkAuth = async function () {
    try {
      const res = await fetch("/api/auth/me");

      if (res.ok) {
        const { data } = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      logger.error("认证检查失败:", error);
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async function (email: string, password: string) {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const { data, message } = await res.json();
      console.log("res.ok", res.ok);
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

  const register = async function (
    email: string,
    password: string,
    username: string
  ) {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password,
        }),
      });
      const { data, message } = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true };
      } else {
        setUser(null);
        return { success: false, message: message };
      }
    } catch (error) {
      logger.error("网络错误,", error);
      return { success: false, message: "网络错误" };
    }
  };

  const logout = async function () {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      setUser(null);
      router.push("/login");
    } catch (error) {
      logger.error("登出失败." + error);
    }
  };

  return {
    user,
    authLoading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === "ADMIN",
    isRoot: user?.role === "ROOT",
  };
}
