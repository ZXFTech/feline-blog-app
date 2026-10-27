"use server";

import { StyledLink } from "@/components/ui/styled-link";
import Head from "next/head";
import { NeuSurface } from "@/components/ui/neu-surface";
import Tag from "@/components/Tag";
import { BlogMarkdown } from "@/components/Blog/BlogMarkdown";
import { NeuPanel } from "@/components/ui/neu-panel";
import Image from "next/image";
import { getBlogById } from "@/db/blogAction";
import { message } from "@/lib/message";
import BlogOperationBar from "@/components/Blog/BlogOperationBar";
import TOC from "@/components/Blog/TOC";
import { BlogReading } from "@/components/Blog/BlogReading";
import Content from "@/components/Content";
import { PermissionAccess } from "@/components/Auth/PermissionAccess";
import AdjacentBlogs from "@/components/Blog/AdjacentBlogs";

interface Props {
  params: Promise<{ id: number }>;
}

const Blog = async ({ params }: Props) => {
  const { id } = await params;
  const result = await getBlogById(id);
  if (result.status !== "success") return <Content><section role="alert"><h1>文章暂时不可用</h1><p>{result.message}</p><a href={`/blog/${id}`}>重试</a></section></Content>;
  const { blog, isLiked, isFavorite } = result.data;

  if (!blog) {
    message.error("未找到博客");
    // 暂时这么写 后续跳转到 404
    // redirect("/blog");
    return (
      <div className="blog-empty-content">
        <NeuSurface className="blog-empty-title">
          这篇博客没有内容, 所以给你看看我的小猫吧~
        </NeuSurface>
        <NeuSurface className="blog-empty-image">
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
        </NeuSurface>
      </div>
    );
  }

  return (
    <BlogReading articleKey={String(blog.id)} articleTitle={blog.title}>
      <Content
        className="mx-auto max-w-[700px]"
        rightSideBar={
          <div>
            <PermissionAccess>
              <StyledLink href={`/blog/edit/${blog.id}`}>编辑</StyledLink>
            </PermissionAccess>
            <TOC />
          </div>
        }
      >
        <Head key={blog.title + blog.id}>
          <title>{blog.title}</title>
        </Head>
        <div className="flex min-w-0 flex-col" id="blog-container">
          <NeuPanel elevation="flat" className="blog-content-container min-w-0">
            <div className="flex min-w-0 flex-col gap-[var(--spacing-panel-gap-default)]">
              <h1 className="blog-article-title" data-blog-title="">
                {blog.title}
              </h1>
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
            </div>
            <TOC compact />
            <BlogMarkdown
              id="blog-content"
              className="blog-content flex-1"
              content={blog.content}
            />
          </NeuPanel>
          <BlogOperationBar
            likes={blog.likeCount ?? 0}
            favorite={blog.favoriteCount ?? 0}
            id={blog.id}
            isLiked={isLiked}
            isFavorite={isFavorite}
          />
          <AdjacentBlogs id={blog.id} />
        </div>
      </Content>
    </BlogReading>
  );
};

export default Blog;
