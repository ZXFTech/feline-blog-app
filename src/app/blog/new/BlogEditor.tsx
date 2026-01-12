"use client";

import MarkdownEditor from "@/components/MarkdownEditor/markdownEditor";
import { createBlog } from "@/db/blogAction";
import { toast as message } from "@/components/ProMessage";
import { useRouter } from "next/navigation";
import { useState, ChangeEventHandler } from "react";

const BlogEditor = () => {
  const router = useRouter();
  // blog state
  const [blogData, setBlogData] = useState({
    title: "",
    content: "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const { blogId } = await createBlog({
        title: blogData.title.trim() ? blogData.title.trim() : "无标题",
        content: blogData.content,
        tags: [],
      });
      message.success("创建成功!");
      setBlogData({
        title: "",
        content: "",
      });
      router.push(`/blog/${blogId}`);
    } catch (error) {
      message.error("创建失败!" + error);
    } finally {
      setLoading(false);
    }
  };

  const onContentChange: ChangeEventHandler<HTMLTextAreaElement> = (value) =>
    setBlogData((prev) => ({
      ...prev,
      content: value.target.value.replaceAll(/(?<!\s\s)\n/g, "  \n"),
    }));
  const onTitleChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setBlogData((prev) => ({ ...prev, title: e.target.value }));

  return (
    <MarkdownEditor
      blogData={blogData}
      onContentChange={onContentChange}
      onTitleChange={onTitleChange}
      handleSubmit={handleSubmit}
      loading={loading}
    />
  );
};

export default BlogEditor;
