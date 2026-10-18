import FlowPage from "../_components/flow-page";
export const dynamic = "force-dynamic";
export const metadata = { title: "选择博客账号", robots: { index: false, follow: false } };
export default function Page() { return <FlowPage binding={false} />; }
