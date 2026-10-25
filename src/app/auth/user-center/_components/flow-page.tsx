import { cookies } from "next/headers";
import { pendingPage } from "@/lib/auth/center/flows";
import { AuthError } from "@/lib/auth/center/config";
import { authMessages } from "@/lib/auth/center/http";
import ActionForm from "./action-form";
import AuthFrame from "./auth-frame";
export default async function FlowPage() {
  let flow;
  let failure;
  try {
    const store = await cookies();
    flow = await pendingPage(name => store.get(name)?.value, "pending_confirmation");
  } catch (error) {
    failure = error instanceof AuthError ? error : new AuthError("AUTH_UNAVAILABLE", 503);
  }
  if (!flow) return <AuthFrame title="本次操作尚未完成"><p role="alert">{authMessages[failure?.code ?? ""] ?? (failure?.status === 503 ? "认证服务暂时不可用，请稍后重试。" : "流程已失效，请重新开始。原账号保持不变。")}</p></AuthFrame>;
  return <AuthFrame title="确认绑定用户中心">
      <p>中心登录邮箱：<strong>{flow.email}</strong></p>
      <p>本次流程到期时间：<time dateTime={flow.expiresAt}>{new Date(flow.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）</time>。过期后请重新开始。</p>
      <p>原博客账号：{flow.legacy.username}（{flow.legacy.email}）。原资料、角色和全部业务数据保持原用户归属。</p><p>确认绑定后，此账号仅使用用户中心登录；原密码散列将被清除，本轮不支持解绑或换绑。两边邮箱可以不同。</p><ActionForm endpoint="/api/auth/user-center/bind/confirm" label="确认绑定并停用旧密码" values={{ flowProof: flow.proof, confirm: true }} />
      <ActionForm endpoint="/api/auth/user-center/cancel" label="取消本次流程" values={{ flowProof: flow.cancelProof }} />
    </AuthFrame>;
}
