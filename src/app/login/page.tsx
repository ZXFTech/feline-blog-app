"use client";

import { StyledLink } from "@/components/ui/styled-link";
import Content from "@/components/Content";
import Icon from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";
import { InputField } from "@/components/ui/input-field";
import { useAuth } from "@/hooks/useAuth";
import { toast as message } from "@/components/ProMessage";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React, { FormEvent, useMemo, useState } from "react";
import { TextGap } from "@/components/TextGap";

export default function Login() {
  const { login } = useAuth();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);

  const [submitted, setSubmitted] = useState(false);

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const errorStatus = useMemo(() => {
    let error = {
      emailError: false,
      emailErrorMessage: "",
      passwordError: false,
      passwordErrorMessage: "",
    };

    if (!email) {
      error = {
        ...error,
        emailError: true,
        emailErrorMessage: "邮箱不能为空",
      };
    }
    if (!password) {
      error = {
        ...error,
        passwordError: true,
        passwordErrorMessage: "密码不能为空",
      };
    }
    return error;
  }, [email, password]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    try {
      e.preventDefault();
      setSubmitted(true);
      if (errorStatus.emailError || errorStatus.passwordError) {
        return;
      }
      setLoading(true);
      const result = await login(email, password);
      if (!result.success) {
        message.error(result.message || "登录失败.");
        return;
      } else {
        message.success("登录成功!");
        const from = searchParams.get("from");
        window.location.assign(from || "/");
      }
    } catch (error) {
      message.error("出错了," + error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Content>
      <form onSubmit={handleSubmit} className="flex justify-center">
        <NeuSurface className="flex flex-col w-100 min-w-50 justify-center items-stretch p-4">
          <div className="text-3xl mb-4 text-center">欢迎</div>
          <InputField
            disabled={loading}
            prefix={<Icon icon="email" size="lg" />}
            id="email"
            className={`${
              submitted && errorStatus.emailError ? "border-red-700! border-2! text-red-700!" : ""
            }`}
            placeholder="请输入邮箱"
            autoComplete="new-password"
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value || "")}
          />
          {submitted && errorStatus.emailErrorMessage ? (
            <span className="text-red-600">{errorStatus.emailErrorMessage}</span>
          ) : null}
          <InputField
            disabled={loading}
            prefix={<Icon icon="lock" size="lg" />}
            id="password"
            className={`${
              submitted && errorStatus.passwordError
                ? "border-red-700! border-2! text-red-700!"
                : ""
            } mt-4`}
            placeholder="请输入密码"
            type="password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value || "")}
          />
          {submitted && errorStatus.passwordErrorMessage ? (
            <span className="text-red-600">{errorStatus.passwordErrorMessage}</span>
          ) : null}
          <span className="mt-4">
            还没有账号,
            <StyledLink href="/register">点击注册</StyledLink>
          </span>

          <Link className="mt-4" href={"/forgot-password"}>
            忘记密码?
          </Link>
          <Button
            loading={loading}
            disabled={loading}
            variant="primary"
            className="mt-4 px-4! py-2! text-xl!"
            type="submit"
            size="lg"
          >
            <TextGap text="登录" gap={4} />
          </Button>
        </NeuSurface>
      </form>
    </Content>
  );
}
