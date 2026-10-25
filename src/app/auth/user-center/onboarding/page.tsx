import AuthFrame from "../_components/auth-frame";
export const dynamic = "force-dynamic";
export const metadata = { title: "博客注册暂未开放", robots: { index: false, follow: false } };
export default function Page() { return <AuthFrame title="博客注册暂未开放"><p>不会根据中心登录自动创建博客账号。请先使用原博客账号登录，再从个人资料页绑定。</p><a href="/login">返回登录</a></AuthFrame>; }
