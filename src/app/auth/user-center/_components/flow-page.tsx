import { cookies } from "next/headers";
import { pendingPage } from "@/lib/auth/center/flows";
import { AuthError } from "@/lib/auth/center/config";
import { authMessages } from "@/lib/auth/center/http";
import ActionForm from "./action-form";
import AuthFrame from "./auth-frame";
export default async function FlowPage({ binding }: { binding: boolean }) {
  let flow;
  let failure;
  try {
    const store = await cookies();
    flow = await pendingPage(name => store.get(name)?.value, binding ? "pending_confirmation" : "pending_choice");
  } catch (error) {
    failure = error instanceof AuthError ? error : new AuthError("AUTH_UNAVAILABLE", 503);
  }
  if (!flow) return <AuthFrame title="本次操作尚未完成"><p role="alert">{authMessages[failure?.code ?? ""] ?? (failure?.status === 503 ? "认证服务暂时不可用，请稍后重试。" : "流程已失效，请重新开始。原账号保持不变。")}</p></AuthFrame>;
  return <AuthFrame title={binding ? "确认绑定用户中心" : "选择你的博客账号"}>
      <p>中心登录邮箱：<strong>{flow.email}</strong></p>
      <p>本次流程到期时间：<time dateTime={flow.expiresAt}>{new Date(flow.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}（北京时间）</time>。过期后请重新开始。</p>
      {binding ? <><p>原博客账号：{flow.legacy?.username}（{flow.legacy?.email}）。原资料、角色和全部业务数据保持原用户归属。</p><p>确认绑定后，此账号仅使用用户中心登录；原密码散列将被清除，本轮不支持解绑或换绑。两边邮箱可以不同。</p><ActionForm endpoint="/api/auth/user-center/bind/confirm" label="确认绑定并停用旧密码" values={{ flowProof: flow.proof, confirm: true }} /></> : <><p>本次回调尚未创建博客账号。你可以验证已有账号，或明确建立一个新账号。</p><ActionForm endpoint="/api/auth/user-center/onboarding" label="绑定已有账号" values={{ flowProof: flow.proof, choice: "legacy" }} /><ActionForm endpoint="/api/auth/user-center/onboarding" label="确认创建新账号" values={{ flowProof: flow.proof, choice: "create", confirm: true }} fields={[{ name: "username", label: "博客昵称", defaultValue: flow.username, maxLength: 50 }]} /></>}
      <ActionForm endpoint="/api/auth/user-center/cancel" label="取消本次流程" values={{ flowProof: flow.cancelProof }} />
    </AuthFrame>;
}
