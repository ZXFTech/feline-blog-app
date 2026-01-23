import { message } from "@/lib/message";
import BlogEditor from "@/components/BlogList/BlogEditor";
import { getBlogById } from "@/db/blogAction";
import { redirect } from "next/navigation";
import Content from "@/components/Content";

interface Props {
  params: Promise<{ id: number }>;
}

const Edit = async ({ params }: Props) => {
  const { id } = await params;
  if (!id) {
    message.error("未找到博客");
    redirect("/blog");
  }

  const { blog } = await getBlogById(Number(id));
  if (!blog) {
    message.error("未找到博客");
    redirect("/blog");
  }
  const formattedBlog = {
    ...blog,
    tags: blog.tags.map((item) => item.tag),
  };

  // blog state

  return (
    <div>
      <Content>
        <BlogEditor blog={formattedBlog} />
      </Content>
    </div>
  );
};

export default Edit;
