import Content from "@/components/Content/content";
import { message } from "@/lib/message";
import BlogEditor from "@/components/BlogList/BlogEditor";
import { getBlogById } from "@/db/blogAction";
import { redirect } from "next/navigation";

const Edit = async ({ params }) => {
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

  // blog state

  return (
    <Content>
      {/* <Temp></Temp> */}
      <BlogEditor blog={blog}></BlogEditor>
    </Content>
  );
};

export default Edit;
