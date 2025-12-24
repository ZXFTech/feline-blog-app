"use client";

import Content from "@/components/Content/content";
import MarkdownEditor from "@/components/MarkdownEditor/markdownEditor";
import { createBlog } from "@/db/blogAction";
import { toast as message } from "@/components/ProMessage";
import { useRouter } from "next/navigation";
import { useState, ChangeEventHandler } from "react";

const New = () => {
  const router = useRouter();
  // blog state
  const [blogData, setBlogData] = useState({
    title: "",
    content: "",
  });

  const handleSubmit = async () => {
    const res = await createBlog({
      title: blogData.title.trim() ? blogData.title.trim() : "无标题",
      content: blogData.content,
    });
    if (res.error) {
      message.error("创建失败!" + res.message);
      return;
    }
    message.success("创建成功!");
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

export default New;
