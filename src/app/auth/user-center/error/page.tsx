import AuthFrame from "../_components/auth-frame";
import { authMessages } from "@/lib/auth/center/http";
export const metadata = { title: "认证未完成", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const message = typeof params.code === "string" && Object.hasOwn(authMessages, params.code) ? authMessages[params.code] : undefined;
  return <AuthFrame title="认证未完成"><p role="alert">{message ?? "本次认证未完成，请重新开始。原账号和数据保持不变。"}</p>{typeof params.requestId === "string" && /^[0-9a-f-]{36}$/.test(params.requestId) ? <p>请求编号：{params.requestId}</p> : null}</AuthFrame>;
}
