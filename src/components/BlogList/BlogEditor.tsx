"use client";

import MarkdownEditor from "@/components/MarkdownEditor/markdownEditor";
import { createBlog, updateBlogById } from "@/db/blogAction";
import { toast as message } from "@/components/ProMessage";
import { useRouter } from "next/navigation";
import { useState, ChangeEventHandler, useEffect } from "react";
import { Role } from "../../../generated/prisma/enums";
import { TagData } from "@/components/TagEditor";

type CombinedBlog = {
  author?: {
    password: string;
    createdAt: Date;
    id: string;
    email: string;
    phone: string | null;
    username: string;
    avatar: string | null;
    work: string | null;
    role: Role;
    updateAt: Date;
  };
  tags?: ({
    tag: {
      content: string;
      createdAt: Date;
      updatedAt: Date;
      id: number;
      color: string;
      userId: string;
    };
  } & {
    assignedAt: Date;
    assignedBy: string;
    tagId: number;
    blogId: number;
  })[];
} & {
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  delete: boolean;
  id: number;
  authorId: string;
};

const BlogEditor = ({ blog }: { blog?: CombinedBlog }) => {
  const router = useRouter();
  // blog state
  const [blogData, setBlogData] = useState({
    title: blog?.title || "",
    content: blog?.content || "",
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      let result;
      if (blog?.id) {
        // 更新
        result = await updateBlogById(Number(blog?.id), {
          title: blogData.title.trim() ? blogData.title.trim() : "无标题",
          content: blogData.content,
          tags: [] as TagData[],
        });
      } else {
        // 新增
        result = await createBlog({
          title: blogData.title.trim() ? blogData.title.trim() : "无标题",
          content: blogData.content,
          tags: [],
        });
      }

      message.success("创建成功!");
      setBlogData({
        title: "",
        content: "",
      });
      router.push(`/blog/${result.blogId}`);
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
