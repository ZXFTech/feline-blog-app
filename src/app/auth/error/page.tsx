import { AuthFrame } from "@/components/Auth/AuthFrame";
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const message =
    code === "ENVIRONMENT_MISMATCH"
      ? "认证环境暂时不匹配，请稍后重新发起登录。"
      : code === "SIGN_OUT_UNCONFIRMED"
        ? "退出尚未确认，请到账号页主动检查会话状态。"
        : "认证未完成，请返回登录页重新发起。";
  return (
    <AuthFrame title="认证未完成">
      <p role="alert">{message}</p>
    </AuthFrame>
  );
}
