import { validateReturnTo } from "@user-center/next-better-auth/public";
import { getSdkConfiguration } from "@/lib/auth/sdk/config";
import { AuthFrame } from "@/components/Auth/AuthFrame";
import { SdkControls } from "@/components/Auth/SdkAuth";
export const dynamic = "force-dynamic";
export const metadata = { title: "登录 neon cat", robots: { index: false, follow: false } };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  let data;
  try {
    const config = getSdkConfiguration();
    const returnTo = validateReturnTo((await searchParams).returnTo, config.manifest);
    data = { config, returnTo };
  } catch {
    return (
      <AuthFrame title="登录暂时不可用">
        <p role="alert">认证配置或返回地址暂时不可用，请稍后重试。</p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="登录 neon cat">
      <p>使用用户中心登录。首次登录后，请确认邮箱并填写博客昵称。</p>
      <SdkControls config={data.config.publicConfig} returnTo={data.returnTo} />
    </AuthFrame>
  );
}
