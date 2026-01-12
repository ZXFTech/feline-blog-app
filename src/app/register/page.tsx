"use client";

import Content from "@/components/Content/content";
import Icon from "@/components/Icon/icon";
import NeuButton from "@/components/NeuButton/neuButton";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import NeuInput from "@/components/NeuInput";
import { TextGap } from "@/components/TextGap/TextGap";
import { useAuth } from "@/hooks/useAuth";
import { toast as message } from "@/components/ProMessage";
import Link from "next/link";
import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function Register() {
  const [loading, setLoading] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const router = useRouter();

  const { register } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [confirmedPassword, setConfirmedPassword] = useState<string>("");
  const [confirmedPasswordError, setConfirmedPasswordError] =
    useState<string>("");

  const errorStatus = useMemo(() => {
    let error = {
      emailError: false,
      emailErrorMessage: "",
      usernameError: false,
      usernameErrorMessage: "",
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
        emailErrorMessage: "邮箱不能为空",
      };
    }
    if (!username) {
      error = {
        ...error,
        usernameError: true,
        usernameErrorMessage: "用户名不能为空",
      };
    }
    if (!password) {
      error = {
        ...error,
        passwordError: true,
        passwordErrorMessage: "密码不能为空",
      };
    }
    if (!confirmedPassword) {
      setConfirmedPasswordError("密码不能为空");
    }
    return error;
  }, [email, password, username, submitted, confirmedPassword]);

  useEffect(() => {
    if (password !== confirmedPassword) {
      setConfirmedPasswordError("两次密码不一致");
    } else {
      setConfirmedPasswordError("");
    }
  }, [confirmedPassword, password]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    try {
      e.preventDefault();
      setSubmitted(true);
      const { emailError, usernameError, passwordError } = errorStatus;
      if (
        emailError ||
        usernameError ||
        passwordError ||
        confirmedPasswordError
      ) {
        return;
      }
      setLoading(true);
      console.log("email", email);
      console.log("password", password);
      const result = await register(email, password, username);
      console.log("result", result);
      if (!result.success) {
        message.error(result.message || "注册失败.");
        return;
      } else {
        message.success("注册成功!");
        router.refresh();
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
          <div className="text-3xl mb-4 text-center">注册账号</div>
          <NeuInput
            allowClear
            disabled={loading}
            prefix={<Icon icon="email" size="lg" />}
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
            prefix={<Icon icon="account_box" size="lg" />}
            className={`${
              errorStatus.usernameError
                ? "border-red-700! border-2! text-red-700!"
                : ""
            } mt-4`}
            placeholder="请输入邮箱"
            autoComplete="new-password"
            value={username}
            onChange={(e) => setUsername(e.target.value || "")}
          />
          {errorStatus.usernameErrorMessage ? (
            <span className="text-red-600">
              {errorStatus.usernameErrorMessage}
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
          <NeuInput
            disabled={loading}
            prefix={<Icon icon="lock" size="lg" />}
            id="confirmedPassword"
            className={`${
              confirmedPasswordError
                ? "border-red-700! border-2! text-red-700!"
                : ""
            } mt-4`}
            placeholder="请再次输入密码"
            type="password"
            value={confirmedPassword}
            onChange={(e) => {
              setConfirmedPassword(e.target.value || "");
            }}
            onBlur={(e) => setConfirmedPassword(e.target.value || "")}
          />
          {confirmedPasswordError ? (
            <span className="text-red-600">{confirmedPasswordError}</span>
          ) : null}
          <span className="mt-4">
            已有账号,
            <NeuButton type="button" buttonType="link" href="/login">
              点击跳转登录
            </NeuButton>
          </span>
          <span>
            注册登录即表示同意 <Link href={""}>用户协议</Link> 和{" "}
            <Link href={""}>隐私政策</Link>
          </span>
          <NeuButton
            loading={loading}
            disabled={loading}
            buttonType="primary"
            className="mt-4 px-4! py-2! text-xl!"
            type="submit"
            btnSize="lg"
          >
            <TextGap text="注册" gap={4} />
          </NeuButton>
        </NeuDiv>
      </form>
    </Content>
  );
}
