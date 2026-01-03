"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import logger from "@/lib/logger/Logger";
import bcrypt from "bcryptjs";
import { error } from "console";
import { toast } from "@/components/ProMessage";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

  const checkAuth = async function () {
    try {
      const res = await fetch("/api/auth/me");

      const data = await res.json();

      if (res.ok) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      logger.error("认证检查失败:", error);
      setUser(null);
    } finally {
      setLoading(false);
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

      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, data: false };
      }
    } catch (error) {
      logger.error("网络错误.", error);
      return { success: false, error: "网络错误" };
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
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        return { success: true };
      } else {
        setUser(null);
        return { success: false, error: data.error };
      }
    } catch (error) {
      logger.error("网络错误,", error);
      return { success: false, error: "网络错误" };
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
    loading,
    login,
    register,
    logout,
    isAuthenticated: !user,
    isAdmin: user?.role === "ADMIN",
    isRoot: user?.role === "ROOT",
  };
}
