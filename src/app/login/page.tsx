"use client";

import Content from "@/components/Content/content";
import Icon from "@/components/Icon/icon";
import NeuButton from "@/components/NeuButton/neuButton";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import NeuInput from "@/components/NeuInput";
import { useAuth } from "@/hooks/useAuth";
import { toast as message } from "@/components/ProMessage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import React, { FormEvent, useMemo, useState } from "react";
import { TextGap } from "@/components/TextGap/TextGap";

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();

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

    if (!submitted) {
      return error;
    }

    if (!email) {
      error = {
        ...error,
        emailError: true,
        emailErrorMessage: "用户名不能为空",
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
  }, [email, password, submitted]);

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
        if (from) {
          router.push(from);
        } else {
          router.push("/");
        }
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
        <NeuDiv className="flex flex-col w-100 min-w-50 justify-center items-stretch p-4">
          <div className="text-3xl mb-4 text-center">欢迎</div>
          <NeuInput
            disabled={loading}
            prefix={<Icon icon="email" size="lg" />}
            id="email"
            className={`${
              errorStatus.emailError
                ? "border-red-700! border-2! text-red-700!"
                : ""
            }`}
            placeholder="请输入邮箱"
            autoComplete="new-password"
            value={email}
            onChange={(e) => setEmail(e.target.value || "")}
          />
          {errorStatus.emailErrorMessage ? (
            <span className="text-red-600">
              {errorStatus.emailErrorMessage}
            </span>
          ) : null}
          <NeuInput
            disabled={loading}
            prefix={<Icon icon="lock" size="lg" />}
            id="password"
            className={`${
              errorStatus.passwordError
                ? "border-red-700! border-2! text-red-700!"
                : ""
            } mt-4`}
            placeholder="请输入密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value || "")}
          />
          {errorStatus.passwordErrorMessage ? (
            <span className="text-red-600">
              {errorStatus.passwordErrorMessage}
            </span>
          ) : null}
          <span className="mt-4">
            还没有账号,
            <NeuButton type="button" buttonType="link" href="/register">
              点击注册
            </NeuButton>
          </span>

          <Link className="mt-4" href={"/forgot-password"}>
            忘记密码?
          </Link>
          <NeuButton
            loading={loading}
            disabled={loading}
            buttonType="primary"
            className="mt-4 px-4! py-2! text-xl!"
            type="submit"
            btnSize="lg"
          >
            <TextGap text="登录" gap={4} />
          </NeuButton>
        </NeuDiv>
      </form>
    </Content>
  );
}
