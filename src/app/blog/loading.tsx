import Content from "@/components/Content";
import { BlogLoadingState } from "@/components/Blog/BlogStatus";

export default function Loading() {
  return (
    <Content className="mx-auto max-w-[700px]">
      <BlogLoadingState />
    </Content>
  );
}
