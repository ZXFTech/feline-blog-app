"use client";

import { ChangeEventHandler, useState } from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import NeuButton from "../NeuButton/neuButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "../NotionBlock/notionBlock";
import Link from "next/link";
import NeuInput from "@/components/NeuInput";

interface Props {
  handleSubmit: () => void;
  loading?: boolean;
  blogData: { title: string; content: string };
  onTitleChange: ChangeEventHandler<HTMLInputElement>;
  onContentChange: ChangeEventHandler<HTMLTextAreaElement>;
}

const MarkdownEditor = ({
  handleSubmit,
  blogData,
  onTitleChange,
  onContentChange,
  loading,
}: Props) => {
  // 编辑页面状态 state
  const [preview, setPreview] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  return (
    <NeuDiv
      className={`flex flex-col px-3! m-2! gap-2.5 transition-all duration-200 ease-in-out ${
        fullScreen
          ? "fixed z-99999999 top-0 bottom-0 left-0 right-0 "
          : "h-[calc(100vh-9rem))]"
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
          <NeuButton
            loading={loading}
            icon="drive_folder_upload"
            onClick={handleSubmit}
          >
            提交
          </NeuButton>
        </div>
      </div>
      {/* TITLE */}
      <NeuInput
        disabled={loading}
        className="bg-black/3 rounded-lg font-medium focus:bg-white/10 focus:outline-none block w-full text-3xl! p-3 disabled:bg-gray-500/20 disabled:opacity-60"
        type="text"
        placeholder="无标题"
        value={blogData.title}
        onChange={onTitleChange as ChangeEventHandler}
      />
      <div className="full-screen-content flex grow mb-1 relative">
        <NeuInput
          textArea
          disabled={loading}
          className={`p-3 transition-all duration-400 ease-in-out ${
            preview ? "w-[49%]" : "w-full"
          } h-full resize-none! bg-black/3 focus:outline-none rounded-md focus:bg-white/10 hide-scrollbar disabled:bg-gray-500/20 disabled:opacity-60`}
          placeholder="输入Markdown内容..."
          value={blogData.content}
          onChange={onContentChange as ChangeEventHandler}
        />
        <NeuDiv
          className={`preview-part m-0! overflow-scroll hide-scrollbar break-all! text-left! transition-all! duration-400! ease-in-out! absolute right-0 top-0 bottom-0 ${
            preview
              ? "p-3! ml-3! grow! w-full md:w-[49%]"
              : "w-0 p-0! overflow-hidden! border-none! "
          }`}
        >
          <ReactMarkdown
            components={{
              code({ className, children, ...props }) {
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
