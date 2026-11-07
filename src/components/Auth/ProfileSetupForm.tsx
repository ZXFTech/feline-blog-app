"use client";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type Payload = {
  action: "complete-profile" | "confirm-email";
  username?: string;
  emailConfirmed: true;
  emailSnapshotDigest: string;
  returnTo?: string;
};
export function ProfileSetupForm({
  email,
  emailDigest,
  action = "complete-profile",
  returnTo,
  submit,
}: {
  email: string;
  emailDigest: string;
  action?: Payload["action"];
  returnTo?: string;
  submit?: (payload: Payload) => Promise<{ returnTo: string }>;
}) {
  const usernameId = useId();
  const [username, setUsername] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const usernameLength = Array.from(username.trim()).length;
  const validUsername =
    action !== "complete-profile" ||
    (usernameLength >= 1 && usernameLength <= 64 && !/\p{Cc}/u.test(username.trim()));
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !confirmed || !validUsername) return;
    setPending(true);
    setMessage("");
    const payload: Payload = {
      action,
      emailConfirmed: true,
      emailSnapshotDigest: emailDigest,
      ...(action === "complete-profile"
        ? { username, ...(returnTo === undefined ? {} : { returnTo }) }
        : {}),
    };
    try {
      if (submit) {
        const result = await submit(payload);
        setMessage(result.returnTo ? "资料已在本地演示中保存。" : "操作完成。");
        return;
      }
      const response = await fetch("/api/account/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        setMessage(
          response.status === 409
            ? "邮箱或资料已变化，请刷新后重新确认。"
            : response.status === 429
              ? "请求过于频繁，请稍后再试。"
              : response.status === 403
                ? "初始化尚未完成，或当前身份不能执行此操作。"
                : "暂时无法保存，请稍后重试。"
        );
        return;
      }
      const result = (await response.json()) as { data?: { returnTo?: string } };
      if (!result.data?.returnTo) throw Error("INVALID_RESPONSE");
      window.location.assign(result.data.returnTo);
    } catch {
      setMessage("暂时无法保存，请稍后重试。");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p>
        当前认证邮箱：<strong>{email}</strong>
      </p>
      {action === "complete-profile" ? (
        <div>
          <label htmlFor={usernameId}>博客昵称</label>
          <Input
            id={usernameId}
            aria-describedby={`${usernameId}-help`}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            maxLength={128}
            autoComplete="nickname"
            disabled={pending}
          />
          <span id={`${usernameId}-help`} className="text-sm">
            填写 1 至 64 个字符。
          </span>
        </div>
      ) : null}
      <label className="flex items-start gap-2">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(value) => setConfirmed(value === true)}
          disabled={pending}
        />
        我确认将此邮箱保存为博客联系邮箱
      </label>
      <Button type="submit" disabled={!confirmed || !validUsername} loading={pending}>
        {action === "complete-profile" ? "完成博客资料" : "确认当前邮箱"}
      </Button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
