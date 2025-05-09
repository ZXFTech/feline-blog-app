"use server";

import Head from "next/head";

import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";

import NotionBlock, { CodeBlock } from "@/components/NotionBlock/notionBlock";

import Image from "next/image";

import { getBlogById } from "@/db/blogAction";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Content from "@/components/Content/content";
import NeuButton from "@/components/NeuButton/neuButton";

// export async function getStaticProps({ params }: { params: { id: number } }) {
//   const postData = await getBlogById(params.id);
//   console.log("postData", postData);
// }

const Blog = async ({ params }: { params: Promise<{ id: number }> }) => {
  const { id } = await params;
  const postData = await getBlogById(id);

  if (!postData) {
    return (
      <div className="blog-empty-content mt-7">
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

  return (
    <Content>
      <div className="operation-bar">
        <NeuButton icon="edit">编辑</NeuButton>
      </div>
      <NeuDiv
        neuType="flat"
        className="blog-content-container mt-3 p-5 border-inherit overflow-auto"
      >
        <Head>
          <title>{postData.title}</title>
        </Head>
        <h1>{postData.title}</h1>
        <div className="flex flex-wrap items-center justify-between mb-3">
          <Tag className="ml-0">{postData.author.username}</Tag>
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
        <div className="blog-content text-left">
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
            {JSON.parse(postData.content)}
          </ReactMarkdown>
        </div>
      </NeuDiv>
    </Content>
  );
};

export default Blog;
