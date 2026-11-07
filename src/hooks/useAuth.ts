"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createUserCenterClient } from "@user-center/next-better-auth/client";
import { useCtxAuth } from "@/providers/AuthProviders";

export function useAuth() {
  const router = useRouter();
  const { authEnabled, setUser, user, authUnavailable, setAuthUnavailable, publicConfig } =
    useCtxAuth();
  const [authLoading, setAuthLoading] = useState(authEnabled);
  const [checkVersion, setCheckVersion] = useState(0);
  useEffect(() => {
    if (!authEnabled) {
      setAuthLoading(false);
      return;
    }
    let active = true;
    setAuthLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        if (response.ok) {
          const body = await response.json();
          if (active) {
            setAuthUnavailable(false);
            setUser(body.data?.user ?? null);
          }
        } else {
          await response.arrayBuffer();
          if (active) {
            setAuthUnavailable(response.status >= 500);
            setUser(null);
          }
        }
      } catch {
        if (active) {
          setAuthUnavailable(true);
          setUser(null);
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authEnabled, setUser, setAuthUnavailable, checkVersion]);
  async function logout() {
    try {
      if (!publicConfig) throw Error("SIGN_OUT_UNCONFIRMED");
      await createUserCenterClient(publicConfig).signOut();
      setUser(null);
      setAuthUnavailable(false);
      router.push("/login");
    } catch {
      setAuthUnavailable(true);
      throw Error("SIGN_OUT_UNCONFIRMED");
    }
  }
  return {
    authEnabled,
    user,
    authLoading,
    authUnavailable,
    logout,
    canSignOut: publicConfig !== null,
    retry: () => setCheckVersion((version) => version + 1),
    isAuthenticated: !!user,
    isAdmin: user?.role === "ADMIN",
    isRoot: user?.role === "ROOT",
  };
}
