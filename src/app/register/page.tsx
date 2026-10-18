import AuthFrame from "@/app/auth/user-center/_components/auth-frame";
import ActionForm from "@/app/auth/user-center/_components/action-form";
export const metadata = { title: "注册 neon cat", robots: { index: false, follow: false } };
export default function Register() {
  return <AuthFrame title="注册博客账号"><p>新账号统一在用户中心注册并验证邮箱，返回后由你明确选择创建博客账号或绑定已有账号。</p><p>本页面不收集或保存本地注册密码。</p><ActionForm endpoint="/api/auth/user-center/start" label="前往用户中心注册" values={{ intent: "register", destination: "profile" }} /></AuthFrame>;
}
