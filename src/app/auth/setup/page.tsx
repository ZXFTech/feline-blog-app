import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { validateReturnTo, type PublicConfig } from "@user-center/next-better-auth/public";
import { getSdkIntegration } from "@/lib/auth/sdk/server";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import { assertProfileStage } from "@/lib/auth/sdk/business";
import { emailSnapshotDigest } from "@/lib/auth/sdk/profile-input";
import { ProfileSetupForm } from "@/components/Auth/ProfileSetupForm";
import { AuthFrame } from "@/components/Auth/AuthFrame";
import { SdkControls } from "@/components/Auth/SdkAuth";
export const dynamic = "force-dynamic";
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  let data;
  let publicConfig: PublicConfig | null = null;
  try {
    const config = getSdkConfiguration();
    publicConfig = config.publicConfig;
    const target = validateReturnTo((await searchParams).returnTo, config.manifest);
    const principal = await getSdkIntegration().getPrincipal(new Headers(await headers()));
    if (principal.status === "anonymous") redirect(`/login?returnTo=${encodeURIComponent(target)}`);
    if (principal.status === "authenticated") redirect(target);
    await assertProfileStage(principal.identity);
    data = { target, email: principal.identity.profile.email };
  } catch (error) {
    unstable_rethrow(error);
    return (
      <AuthFrame title="暂时无法完成资料">
        <p role="alert">初始化尚未完成或认证暂时不可用，请稍后重新检查。</p>
        {publicConfig ? <SdkControls config={publicConfig} mode="logout" /> : null}
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="完成博客资料">
      <ProfileSetupForm
        email={data.email}
        emailDigest={emailSnapshotDigest(data.email)}
        returnTo={data.target}
      />
      {publicConfig ? <SdkControls config={publicConfig} mode="logout" /> : null}
    </AuthFrame>
  );
}
