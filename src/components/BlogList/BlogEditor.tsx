"use client";

import MarkdownEditor from "@/components/MarkdownEditor";
import { createBlog, updateBlogById } from "@/db/blogAction";
import { toast as message } from "@/components/ProMessage";
import { useRouter } from "next/navigation";
import { useState, ChangeEventHandler } from "react";
import { TagData } from "@/components/TagEditor";
import { CombinedBlog } from "@/types/blog";

const BlogEditor = ({ blog }: { blog?: CombinedBlog }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // blog state
  const [blogData, setBlogData] = useState({
    id: blog?.id,
    title: blog?.title || "",
    content: blog?.content || "",
    tags: blog?.tags || [],
  });

  const handleSubmit = async () => {
    try {
      setLoading(true);
      let result;
      if (blog?.id) {
        // 更新
        result = await updateBlogById(Number(blog?.id), {
          title: blogData.title.trim() ? blogData.title.trim() : "无标题",
          content: blogData.content,
          tags: blogData.tags,
        });
      } else {
        // 新增
        result = await createBlog({
          title: blogData.title.trim() ? blogData.title.trim() : "无标题",
          content: blogData.content,
          tags: blogData.tags,
        });
      }

      message.success("创建成功!");
      setBlogData({
        id: undefined,
        title: "",
        content: "",
        tags: [],
      });

      router.push(`/blog/${result.blogId}`);
    } catch (error) {
      message.error("创建失败!" + error);
    } finally {
      setLoading(false);
    }
  };

  const onTagChange = (tags: TagData[]) => {
    setBlogData({
      ...blogData,
      tags,
    });
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
      blog={blogData}
      id={blog?.id}
      onContentChange={onContentChange}
      onTitleChange={onTitleChange}
      handleSubmit={handleSubmit}
      loading={loading}
      onTagChange={onTagChange}
    />
  );
};

export default BlogEditor;
