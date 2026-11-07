import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { AuthFrame } from "@/components/Auth/AuthFrame";
import { SdkControls } from "@/components/Auth/SdkAuth";
import { ProfileSetupForm } from "@/components/Auth/ProfileSetupForm";
import { getSdkIntegration } from "@/lib/auth/sdk/server";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import { assertProfileAllowed, readInstallation, SdkHostError } from "@/lib/auth/sdk/business";
import { emailSnapshotDigest } from "@/lib/auth/sdk/profile-input";
import type { PublicConfig } from "@user-center/next-better-auth/public";
export const dynamic = "force-dynamic";
export const metadata = { title: "账号与安全", robots: { index: false, follow: false } };
export default async function Profile() {
  let data;
  let publicConfig: PublicConfig | null = null;
  try {
    const config = getSdkConfiguration();
    publicConfig = config.publicConfig;
    const principal = await getSdkIntegration().getPrincipal(new Headers(await headers()));
    if (principal.status === "anonymous") redirect("/login");
    if (principal.status === "mapping-required") redirect("/auth/setup");
    const state = await readInstallation();
    assertProfileAllowed(state, principal.identity);
    data = { config, principal, state };
  } catch (error) {
    unstable_rethrow(error);
    const pending = error instanceof SdkHostError && error.code === "INITIALIZATION_PENDING";
    return (
      <AuthFrame title={pending ? "业务初始化中" : "账号暂时不可用"}>
        <p role="alert">
          {pending
            ? "初始化尚未完成，当前账号暂不能查看博客资料。"
            : "暂时无法核验账号，请稍后重试。"}
        </p>
        {publicConfig ? <SdkControls config={publicConfig} mode="logout" /> : null}
      </AuthFrame>
    );
  }
  const { config, principal, state } = data;
  const user = principal.user;
  return (
    <AuthFrame title="账号与安全">
      <dl>
        <dt>用户 ID</dt>
        <dd>{user.id}</dd>
        <dt>博客昵称</dt>
        <dd>{user.username}</dd>
        <dt>已确认联系邮箱</dt>
        <dd>{user.email}</dd>
        <dt>当前认证邮箱</dt>
        <dd>{principal.identity.profile.email}</dd>
        <dt>博客角色</dt>
        <dd>{user.role}</dd>
      </dl>
      {state.phase !== "ready" ? <p role="status">业务正在维护，账号和资料仍可检查。</p> : null}
      {user.email !== principal.identity.profile.email ? (
        <p>认证邮箱已变化，确认后才会更新博客联系邮箱。</p>
      ) : null}
      <ProfileSetupForm
        email={principal.identity.profile.email}
        emailDigest={emailSnapshotDigest(principal.identity.profile.email)}
        action="confirm-email"
      />
      <SdkControls config={config.publicConfig} mode="logout" />
    </AuthFrame>
  );
}
