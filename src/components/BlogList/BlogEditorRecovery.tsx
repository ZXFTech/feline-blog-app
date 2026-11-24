import { BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { BlogRecovery } from "@/components/Blog/BlogRecovery";
import type { ActionFailureStatus } from "@/lib/server/actionResult";

export function BlogEditorRecovery({ status }: { status: ActionFailureStatus }) {
  return (
    <BlogStatusPanel
      title={status === "forbidden" ? "没有文章编辑权限" : "暂时无法打开草稿"}
      description={
        status === "forbidden"
          ? "当前账号没有 Blog 作者权限。"
          : status === "not_found" || status === "invalid_input"
            ? "草稿或文章不存在、已删除，或不属于当前作者。"
            : "读取失败，可以重新尝试。"
      }
      failure
    >
      <BlogRecovery />
    </BlogStatusPanel>
  );
}
