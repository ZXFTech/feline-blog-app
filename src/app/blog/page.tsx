import BlogList from "@/components/BlogList/blogList";
import Content from "@/components/Content";
import { BlogListOperationBar } from "@/components/BlogList/BlogListOperationBar";
import { getBlogList } from "@/db/blogAction";

interface BlogPageProps {
  searchParams: Promise<{
    orderBy?: "desc" | "asc";
    page?: string;
    tags?: string | string[];
    content?: string;
  }>;
}

export default async function Blog({ searchParams }: BlogPageProps) {
  const { orderBy = "desc", page, tags, content } = await searchParams;

  const { blogs, pageBean, total } = await getBlogList(1, 20, {
    orderBy,
    content,
  });

  return (
    <>
      <BlogListOperationBar />
      <BlogList dataSource={blogs} />
    </>
  );
}
