import BlogList from "@/components/BlogList/blogList";
import Content from "@/components/Content";
import { BlogListOperationBar } from "@/components/BlogList/BlogListOperationBar";
import { getBlogList } from "@/db/blogAction";
import { BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { BlogRecovery } from "@/components/Blog/BlogRecovery";
import { NeuPanel } from "@/components/ui/neu-panel";
import { normalizeBlogQuery } from "@/lib/blog/query";

interface BlogPageProps {
  searchParams: Promise<{
    orderBy?: string | string[];
    page?: string;
    tags?: string | string[];
    content?: string | string[];
  }>;
}

export default async function Blog({ searchParams }: BlogPageProps) {
  const params = await searchParams;
  const { orderBy, content } = normalizeBlogQuery(params.content, params.orderBy);

  const result = await getBlogList(1, 20, {
    orderBy,
    content,
  });

  return (
    <Content className="mx-auto max-w-[700px] flex flex-col gap-[var(--spacing-panel-gap-default)]">
      <NeuPanel>
        <h1 tabIndex={-1} data-blog-result-title="" className="text-2xl font-semibold">
          文章
        </h1>
        <p className="break-words">
          {content ? `正文包含“${content}”` : "全部文章"}，
          {orderBy === "asc" ? "最早在前" : "最新在前"}
        </p>
        {result.status === "success" ? (
          <p role="status">
            共 {result.data.total} 篇，当前显示 {result.data.blogs.length} 篇
            {result.data.total > 20 ? "，只显示前 20 篇" : ""}
          </p>
        ) : (
          <p>结果暂不可用</p>
        )}
      </NeuPanel>
      <BlogListOperationBar empty={result.status === "success" && result.data.blogs.length === 0} />
      {result.status === "success" ? (
        <BlogList dataSource={result.data.blogs} />
      ) : (
        <BlogStatusPanel
          failure
          title="暂时无法读取文章列表"
          description="读取暂时失败，你可以保留当前条件重试。"
        >
          <BlogRecovery />
        </BlogStatusPanel>
      )}
    </Content>
  );
}
