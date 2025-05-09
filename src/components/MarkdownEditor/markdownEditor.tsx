"use client";

import { ChangeEventHandler, FormEvent, useEffect, useState } from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import NeuButton from "../NeuButton/neuButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "../NotionBlock/notionBlock";
import Link from "next/link";
import { message } from "@/lib/message";
import { useRouter } from "next/navigation";
import { createBlog } from "@/db/blogAction";
import { title } from "process";

const MarkdownEditor = () => {
  const router = useRouter();
  // blog state
  const [blogData, setBlogData] = useState({
    title: "",
    content: "",
  });

  useEffect(() => {
    console.log("blogData.content", JSON.stringify(blogData));
  }, [blogData]);

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

  // 编辑页面状态 state
  const [preview, setPreview] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const onContentChange: ChangeEventHandler<HTMLTextAreaElement> = (value) =>
    setBlogData((prev) => ({
      ...prev,
      content: value.target.value.replaceAll(/(?<!\s\s)\n/g, "  \n"),
    }));
  const onTitleChange: ChangeEventHandler<HTMLInputElement> = (e) =>
    setBlogData((prev) => ({ ...prev, title: e.target.value }));
  return (
    <NeuDiv
      className={`flex flex-col gap-2.5 transition-all duration-200 ease-in-out ${
        fullScreen
          ? "fixed z-99999999 top-0 bottom-0 left-0 right-0 "
          : "static h-full"
      }`}
    >
      <div className="top-panel mx-0! mt-1! flex justify-between items-center">
        <div className="left">
          <Link href="/blog" className="hover:no-underline!">
            <NeuButton icon="arrow_back_ios">退出编辑</NeuButton>
          </Link>
        </div>
        <div className="right flex wrap">
          <NeuButton
            icon={fullScreen ? "fullScreen_exit" : "fullScreen"}
            onClick={() => setFullScreen((prev) => !prev)}
          >
            {`${fullScreen ? "退出全屏" : "全屏"}`}
          </NeuButton>
          <NeuButton
            icon={preview ? "visibility_off" : "visibility"}
            onClick={() => setPreview((prev) => !prev)}
          >
            {preview ? "关闭预览" : "预览"}
          </NeuButton>
          <NeuButton icon="save">保存</NeuButton>
          <NeuButton icon="drive_folder_upload" onClick={handleSubmit}>
            提交
          </NeuButton>
        </div>
      </div>
      {/* TITLE */}
      <NeuDiv neuType="debossed" className="m-0! p-0!">
        <input
          className="bg-black/3 font-medium focus:bg-white/10 focus:outline-none block w-full text-3xl! p-3"
          type="text"
          placeholder="无标题"
          value={blogData.title}
          onChange={onTitleChange}
        />
      </NeuDiv>
      <div className="full-screen-content flex grow mb-1 relative">
        <div className="grow h-full w-[50%]">
          <NeuDiv
            neuType="debossed"
            className="flex gap-1 flex-1 h-full mt-3 p-0! m-0!"
          >
            <textarea
              className="p-3 resize-none! grow bg-black/3 focus:outline-none rounded-md focus:bg-white/10 hide-scrollbar"
              placeholder="输入Markdown内容..."
              value={blogData.content}
              onChange={onContentChange}
            />
          </NeuDiv>
        </div>
        <NeuDiv
          className={`preview-part m-0! break-all! text-left! transition-all! duration-400! ease-in-out! absolute right-0 top-0 bottom-0 ${
            preview
              ? "p-3! ml-3! grow! w-full md:static md:w-[50%]"
              : "w-0 p-0! overflow-hidden! border-none! "
          }`}
        >
          <ReactMarkdown
            components={{
              code({ node, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                return match ? (
                  <CodeBlock
                    title="test"
                    code={children ? children.toString() : ""}
                    language={match[1]}
                  ></CodeBlock>
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
            }}
            remarkPlugins={[remarkGfm]}
          >
            {blogData.content}
          </ReactMarkdown>
        </NeuDiv>
      </div>
    </NeuDiv>
  );
};

export default MarkdownEditor;
