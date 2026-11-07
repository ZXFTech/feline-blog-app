"use client";
import { useState } from "react";
import { createUserCenterClient } from "@user-center/next-better-auth/client";
import type { PublicConfig } from "@user-center/next-better-auth/public";
import { Button } from "@/components/ui/button";

export function AuthActionButton({
  label,
  onAction,
  disabled = false,
}: {
  label: string;
  onAction: () => Promise<void>;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        loading={pending}
        disabled={disabled}
        onClick={async () => {
          setPending(true);
          setMessage("");
          try {
            await onAction();
          } catch {
            setMessage(
              label.includes("退出")
                ? "退出尚未确认，请主动检查会话状态。"
                : "操作未完成，请稍后重新发起。"
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {label}
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
export function SdkControls({
  config,
  mode = "login",
  returnTo,
}: {
  config: PublicConfig;
  mode?: "login" | "logout";
  returnTo?: string;
}) {
  const [sessionMessage, setSessionMessage] = useState("");
  const client = () => createUserCenterClient(config);
  return (
    <div className="flex flex-col gap-3">
      {mode === "login" ? (
        <AuthActionButton
          label="使用用户中心登录"
          onAction={async () => {
            const result = await client().startLogin(
              returnTo === undefined ? undefined : { returnTo }
            );
            window.location.assign(result.url);
          }}
        />
      ) : (
        <>
          <AuthActionButton
            label="退出当前平台"
            onAction={async () => {
              await client().signOut();
              window.location.assign("/login");
            }}
          />
          <AuthActionButton
            label="检查会话状态"
            onAction={async () => {
              const session = await client().getSession();
              setSessionMessage(session ? "当前平台会话仍有效。" : "当前平台已没有有效会话。");
              if (!session) window.location.assign("/login");
            }}
          />
          {sessionMessage ? <p role="status">{sessionMessage}</p> : null}
        </>
      )}
    </div>
  );
}
