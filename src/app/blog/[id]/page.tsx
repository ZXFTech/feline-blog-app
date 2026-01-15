"use server";

import Head from "next/head";
import NeuDiv from "@/components/NeuDiv";
import Tag from "@/components/Tag";
import { CodeBlock } from "@/components/NotionBlock";
import Image from "next/image";
import { getBlogById } from "@/db/blogAction";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Content from "@/components/Content";
import { message } from "@/lib/message";
import BlogOperationBar from "@/components/Blog/BlogOperationBar";

const Blog = async ({ params }: { params: Promise<{ id: number }> }) => {
  const { id } = await params;
  const { blog, isLiked, isFavorite } = await getBlogById(id);

  if (!blog) {
    message.error("未找到博客");
    // 暂时这么写 后续跳转到 404
    // redirect("/blog");
    return (
      <div className="blog-empty-content">
        <NeuDiv className="blog-empty-title">
          这篇博客没有内容, 所以给你看看我的小猫吧~
        </NeuDiv>
        <NeuDiv className="blog-empty-image">
          <div>
            <Image
              layout="responsive"
              src="/myCat.jpg"
              alt="my cat"
              width={100}
              height={100}
              objectFit="cover"
            />
          </div>
        </NeuDiv>
      </div>
    );
  }

  return (
    <Content>
      <Head key={blog.title + blog.id}>
        <title>{blog.title}</title>
      </Head>
      <div className="flex flex-col w-[80vw]">
        <NeuDiv className="sticky top-0">
          <h1>{blog.title}</h1>
          <div className="flex flex-wrap items-center justify-between">
            {/* <Tag className="ml-0">{blog.author.username}</Tag> */}
            <Tag className="ml-0">{blog.author.username.toString()}</Tag>
            {blog.tags.length ? (
              <ul className="flex flex-wrap gap-1 p-0 mx-0">
                {blog.tags.map((item) => {
                  return (
                    <Tag color={item.tag.color} key={item.blogId + item.tagId}>
                      {item.tag.content}
                    </Tag>
                  );
                })}
              </ul>
            ) : (
              <></>
            )}
          </div>
        </NeuDiv>
        <NeuDiv
          neuType="flat"
          className="blog-content-container px-4 pt-2 pb-4 overflow-auto"
        >
          <div className="blog-content text-left flex-1 overflow-scroll hide-scrollbar">
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
          </div>
        </NeuDiv>
        <div className="sticky bottom-2 left-0 right-0">
          <BlogOperationBar
            likes={blog.likeCount}
            favorite={blog.favoriteCount}
            id={blog.id}
            isLiked={isLiked}
            isFavorite={isFavorite}
          />
        </div>
      </div>
    </Content>
  );
};

export default Blog;
