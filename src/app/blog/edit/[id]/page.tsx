"use client";

import Content from "@/components/Content/content";
import MarkdownEditor from "@/components/MarkdownEditor/markdownEditor";
import RightSideBar from "@/components/RightSideBar";
import BlogEditBar from "@/components/RightSideBar/BlogEditBar";
import { createBlog, getBlogById, updateBlogById } from "@/db/blogAction";
import { message } from "@/lib/message";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, ChangeEventHandler } from "react";

const Edit = () => {
  const router = useRouter();
  const params = useParams();

  console.log("params", params);

  const blogId = Number((params as { id: string }).id);
  if (!blogId) {
    message.error("未找到博客!");
    router.push("/");
  }

  // blog state
  const [blogData, setBlogData] = useState({
    title: "",
    content: "",
  });

  const getBlogData = async (id: number) => {
    const res = await getBlogById(id);
    if (res.error) {
      message.error("获取博客失败!" + res.message);
      router.push("/");
    }
    return res.data;
  };

  useEffect(() => {
    getBlogData(Number(blogId)).then((res) => {
      const { blog } = res!;
      setBlogData({
        title: blog?.title || "",
        content: blog?.content || "",
      });
    });
  }, []);

  const handleSubmit = async () => {
    const res = await updateBlogById(blogId, {
      title: blogData.title.trim() ? blogData.title.trim() : "无标题",
      content: blogData.content.trim(),
    });
    if (res.error) {
      message.error("更新失败!" + res.message);
      return;
    }
    message.success("更新成功!");
    setBlogData({
      title: "",
      content: "",
    });
    router.push(`/blog/${res.data?.blogId}`);
  };

  const onContentChange: ChangeEventHandler<HTMLTextAreaElement> = (value) =>
    setBlogData((prev) => ({
      ...prev,
      content: value.target.value.replaceAll(/(?<!\s\s)\n/g, "  \n"),
    }));
  const onTitleChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setBlogData((prev) => ({ ...prev, title: e.target.value }));

  return (
    <Content>
      <MarkdownEditor
        blogData={blogData}
        onContentChange={onContentChange}
        onTitleChange={onTitleChange}
        handleSubmit={handleSubmit}
      />
    </Content>
  );
};

export default Edit;
