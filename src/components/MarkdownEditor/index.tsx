"use client";

import { ChangeEventHandler, useEffect, useState } from "react";
import NeuDiv from "../NeuDiv";
import NeuButton from "../NeuButton";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "../NotionBlock";
import Link from "next/link";
import NeuInput from "@/components/NeuInput";
import { getOptionTagsById } from "@/db/tagAction";
import TagEditor, { TagData } from "../TagEditor";

interface Props {
  handleSubmit: () => void;
  loading?: boolean;
  blog: { title: string; content: string; tags?: TagData[] };
  id?: number;
  onTitleChange: ChangeEventHandler<HTMLInputElement>;
  onContentChange: ChangeEventHandler<HTMLTextAreaElement>;
  onTagChange: (tags: TagData[]) => void;
}

const MarkdownEditor = ({
  handleSubmit,
  blog,
  id,
  onTitleChange,
  onContentChange,
  onTagChange,
  loading,
}: Props) => {
  // 编辑页面状态 state
  const [preview, setPreview] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [optionTags, setOptionTags] = useState<TagData[]>([]);

  useEffect(() => {
    getOptionTagsById("blog", id).then((res) => setOptionTags(res));
  }, [id]);

  return (
    <div
      className={`flex flex-col px-3! gap-2.5 transition-all duration-200 ease-in-out ${
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
        value={blog.title}
        onChange={onTitleChange as ChangeEventHandler}
      />
      <TagEditor
        setValue={onTagChange}
        value={blog.tags || []}
        options={optionTags}
      />
      <div className="full-screen-content flex grow mb-1 relative">
        <NeuInput
          textArea
          disabled={loading}
          className={`p-3 transition-all duration-400 ease-in-out ${
            preview ? "w-[49%]" : "w-full"
          } h-full resize-none! bg-black/3 focus:outline-none rounded-md focus:bg-white/10 hide-scrollbar disabled:bg-gray-500/20 disabled:opacity-60`}
          placeholder="输入 Markdown 内容..."
          value={blog.content}
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
            {blog.content}
          </ReactMarkdown>
        </NeuDiv>
      </div>
    </div>
  );
};

export default MarkdownEditor;
