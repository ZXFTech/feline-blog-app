import Content from "@/components/Content";
import { BlogStatusPanel } from "@/components/Blog/BlogStatus";
export default function LoadingDrafts() {
  return (
    <Content>
      <BlogStatusPanel title="我的草稿" description="正在加载私有草稿…" busy />
    </Content>
  );
}
