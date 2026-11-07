import { AuthFrame } from "@/components/Auth/AuthFrame";
export const metadata = {
  title: "注册 neon cat",
  robots: { index: false, follow: false },
  referrer: "strict-origin" as const,
};
export default function Register() {
  return (
    <AuthFrame title="通过用户中心创建账号">
      <p>请先使用用户中心登录，再确认邮箱并填写博客昵称。</p>
      <a href="/login">前往登录</a>
    </AuthFrame>
  );
}
