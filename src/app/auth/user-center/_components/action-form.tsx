"use client";
import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { navigateAuthentication, type PublicRoutes } from "@/lib/auth-navigation";
const subscribe = () => () => {};

export default function ActionForm({ endpoint, label, values = {}, fields = [], routes }: { endpoint: string; label: string; values?: Record<string, string | boolean>; fields?: { name: string; label: string; type?: string; defaultValue?: string; maxLength?: number }[]; routes?: PublicRoutes }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const errorId = useId();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrf = await csrfResponse.json();
      if (!csrfResponse.ok) throw new Error(csrf.message ?? "暂时无法开始认证，请稍后重试。");
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, mode: "cors", credentials: "same-origin", redirect: "error", body: JSON.stringify({ ...input, ...values, csrfToken: csrf.data.csrfToken }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message + (response.status === 429 ? ` 请等待 ${response.headers.get("Retry-After") ?? "60"} 秒。` : ""));
      if (result.data?.navigation) {
        if (!routes) throw Error("登录流程已失效，请从应用重新开始。");
        await navigateAuthentication(result.data.navigation, routes);
      } else {
        const path = result.data?.location ?? "/profile";
        if (!["/", "/profile", "/dashboard", "/login", "/auth/user-center/confirm"].includes(path)) throw Error("登录流程已失效，请从应用重新开始。");
        window.location.assign(path);
      }
    } catch (error) { setError(error instanceof Error ? error.message : "网络暂时不可用，请稍后重试。"); }
    finally { setPending(false); }
  }
  return <form method="post" action={endpoint} onSubmit={submit} className="flex flex-col gap-4" aria-busy={pending || !hydrated}>
    {fields.map(field => <label key={field.name} className="flex flex-col gap-2"><span>{field.label}</span><Input className="min-h-11" name={field.name} type={field.type ?? "text"} defaultValue={field.defaultValue} maxLength={field.maxLength ?? 128} required disabled={pending || !hydrated} autoComplete={field.type === "password" ? "current-password" : field.type === "email" ? "email" : "nickname"} aria-describedby={error ? errorId : undefined} /></label>)}
    {error ? <p role="alert" id={errorId}>{error}</p> : null}
    <Button className="min-h-11" type="submit" disabled={pending || !hydrated} loading={pending}>{!hydrated ? "正在加载…" : pending ? "正在处理…" : label}</Button>
  </form>;
}
