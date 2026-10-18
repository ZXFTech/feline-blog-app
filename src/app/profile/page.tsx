import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveCurrentUser } from "@/lib/auth/userAuth";
import AuthFrame from "@/app/auth/user-center/_components/auth-frame";
import ActionForm from "@/app/auth/user-center/_components/action-form";
export const dynamic = "force-dynamic";
export const metadata = { title: "账号与安全", robots: { index: false, follow: false } };
export default async function Profile() {
  const result = await resolveCurrentUser();
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status !== "success") return <AuthFrame title="账号暂时不可用"><p role="alert">{result.message}</p><Link href="/profile" prefetch={false}>重试</Link><ActionForm endpoint="/api/auth/logout" label="退出当前浏览器" /></AuthFrame>;
  const user = result.data;
  return <AuthFrame title="账号与安全"><dl><dt>博客昵称</dt><dd>{user.username}</dd><dt>博客邮箱</dt><dd>{user.email}</dd><dt>博客角色</dt><dd>{user.role}</dd></dl>
    {user.authMode === "legacy" ? <><h2>绑定用户中心</h2><p>你仍可使用旧账号。绑定前需要重新验证原密码；忘记原密码时请保留原账号，本轮不能通过邮箱自动认领。</p><ActionForm endpoint="/api/auth/user-center/bind/start" label="验证旧密码并前往用户中心" fields={[{ name: "password", label: "原博客密码", type: "password" }]} /></> : <><p>此账号仅使用用户中心登录，原博客密码已停用。</p>{"centerEmail" in user ? <p>中心登录邮箱：{user.centerEmail}<br />最近核验于：{user.centerEmailVerifiedAt}</p> : null}</>}
    <ActionForm endpoint="/api/auth/logout" label="退出当前浏览器" />
  </AuthFrame>;
}
