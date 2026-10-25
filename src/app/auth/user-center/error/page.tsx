import AuthFrame from "../_components/auth-frame";
export const metadata = { title: "认证未完成", robots: { index: false, follow: false } };
export default function Page(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  void props;
  return <AuthFrame title="认证未完成"><p role="alert">登录或授权未完成，请从应用重新开始</p></AuthFrame>;
}
