"use server";

import Head from "next/head";

import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";

import { CodeBlock } from "@/components/NotionBlock/notionBlock";

import Image from "next/image";

import { getBlogById } from "@/db/blogAction";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Content from "@/components/Content/content";
import BlogEditBar from "@/components/RightSideBar/BlogEditBar";
import { message } from "@/lib/message";
import { Suspense } from "react";
import Loading from "@/app/loading";

// export async function getStaticProps({ params }: { params: { id: number } }) {
//   const postData = await getBlogById(params.id);
//   console.log("postData", postData);
// }

const Blog = async ({ params }: { params: Promise<{ id: number }> }) => {
  const { id } = await params;
  const { data, error, message: errMessage } = await getBlogById(id);

  if (error) {
    message.error(errMessage!);
  }

  if (!data || !data.blog) {
    return (
      <div className="blog-empty-content">
        <NeuDiv className="blog-empty-title">
          这篇博客没有内容, 所以给你看看我的小猫吧~
        </NeuDiv>
        <NeuDiv className="blog-empty-image">
          <div>
            <Image
              layout="responsive"
              src="/img/myCat.jpg"
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

  const { blog } = data;

  return (
    <Content rightSideBar={<BlogEditBar blogId={id} />}>
      <Suspense fallback={<Loading />}>
        <div className="flex flex-col py-3">
          <NeuDiv
            neuType="flat"
            className="blog-content-container p-5 overflow-auto"
          >
            <Head>
              <title>{blog.title}</title>
            </Head>
            <h1>{blog.title}</h1>
            <div className="flex flex-wrap items-center justify-between mb-3">
              <Tag className="ml-0">{blog.author.username}</Tag>
              {/* {(postData.TagsOnBlog||[]).length && (
          <ul className="flex flex-wrap gap-1 p-0 mx-0 my-3">
            {postData.TagsOnBlog.map((tag) => {
              return (
                <Tag color={tag.color} key={tag.id}>
                  {tag.name}
                </Tag>
              );
            })}
          </ul>
        )} */}
            </div>
            <div className="blog-content text-left flex-1 overflow-scroll hide-scrollbar h-[calc(100vh-20rem))]">
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
        </div>
      </Suspense>
    </Content>
  );
};

export default Blog;
