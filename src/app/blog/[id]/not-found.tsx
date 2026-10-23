import Content from "@/components/Content";
import { BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { BlogRecovery } from "@/components/Blog/BlogRecovery";

export default function NotFound() {
  return (
    <Content className="mx-auto max-w-[700px]">
      <BlogStatusPanel pageTitle title="404" description="文章不存在或已删除">
        <BlogRecovery label="重新检查" listPrimary reloadDocument />
      </BlogStatusPanel>
    </Content>
  );
}
