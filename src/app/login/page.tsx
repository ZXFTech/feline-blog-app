import AuthFrame from "@/app/auth/user-center/_components/auth-frame";
import ActionForm from "@/app/auth/user-center/_components/action-form";
import { cookies } from "next/headers";
import { currentFlow } from "@/lib/auth/center/store";
import { flowProof } from "@/lib/auth/center/flows";
import { publicAuthRoutes } from "@/lib/auth/center/config";
export const dynamic = "force-dynamic";
export const metadata = { title: "登录 neon cat", robots: { index: false, follow: false }, referrer: "strict-origin" as const };
export default async function Login() {
  const store = await cookies();
  let cancelProof: string | undefined;
  if (store.size) {
    try {
      const { browser, flow } = await currentFlow(name => store.get(name)?.value, ["created", "exchanging", "pending_choice", "pending_confirmation"]);
      cancelProof = flowProof("cancel", browser, flow);
    } catch { /* A stale flow cannot authorize a cancellation. */ }
  }
  return <AuthFrame title="登录 neon cat"><p>使用用户中心登录，保留属于你的博客与工具数据。</p><ActionForm routes={publicAuthRoutes()} endpoint="/api/auth/user-center/start" label="使用用户中心登录" values={{ intent: "login", destination: "home" }} />
    <details><summary className="cursor-pointer py-3">旧账号登录</summary><p>尚未绑定的旧账号可以继续使用原密码。登录后可主动绑定，两边邮箱无需相同。</p><ActionForm endpoint="/api/auth/login" label="登录旧账号" fields={[{ name: "email", label: "原博客邮箱", type: "email", maxLength: 254 }, { name: "password", label: "原博客密码", type: "password" }]} /><p>已绑定或忘记中心密码，请使用用户中心的密码恢复入口；本轮不提供遗失旧密码后的账号认领。</p></details>
    {cancelProof ? <ActionForm endpoint="/api/auth/user-center/cancel" label="取消当前未完成流程" values={{ flowProof: cancelProof }} /> : null}
  </AuthFrame>;
}
