"use client";
import { useState } from "react";
import { AuthActionButton } from "@/components/Auth/SdkAuth";
import { ProfileSetupForm } from "@/components/Auth/ProfileSetupForm";
import { NeuPanel } from "@/components/ui/neu-panel";
import type { DemoProps } from "@/app/album/_components/catalog";
export default function SdkAuthDemo({ compact = false }: DemoProps) {
  const [message, setMessage] = useState("");
  if (compact)
    return (
      <NeuPanel>
        <p>完成博客资料</p>
        <p>请确认邮箱并填写昵称。</p>
        <AuthActionButton
          label="本地登录演示"
          onAction={async () => setMessage("仅更新本地演示状态。")}
        />
        {message ? <p role="status">{message}</p> : null}
      </NeuPanel>
    );
  return (
    <div className="flex flex-col gap-6">
      <NeuPanel>
        <h2>登录与退出反馈</h2>
        <AuthActionButton
          label="本地登录演示"
          onAction={async () => setMessage("登录按钮演示已完成，没有发送请求。")}
        />
        <AuthActionButton
          label="退出未确认演示"
          onAction={async () => {
            throw Error("SIGN_OUT_UNCONFIRMED");
          }}
        />
        {message ? <p role="status">{message}</p> : null}
      </NeuPanel>
      <NeuPanel>
        <h2>博客资料确认</h2>
        <ProfileSetupForm
          email="reader@example.test"
          emailDigest={"a".repeat(64)}
          submit={async () => ({ returnTo: "/profile" })}
        />
      </NeuPanel>
    </div>
  );
}
