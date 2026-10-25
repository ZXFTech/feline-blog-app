import AuthFrame from "@/app/auth/user-center/_components/auth-frame";
export const metadata = { title: "注册 neon cat", robots: { index: false, follow: false }, referrer: "strict-origin" as const };
export default function Register() {
  return <AuthFrame title="博客注册暂未开放"><p>当前不创建新博客账号。已有账号可以登录后，从个人资料页绑定用户中心。</p><a href="/login">返回登录</a></AuthFrame>;
}
