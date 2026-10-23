"use server";

import { StyledLink } from "@/components/ui/styled-link";
import Head from "next/head";
import Tag from "@/components/Tag";
import { BlogMarkdown } from "@/components/Blog/BlogMarkdown";
import { NeuPanel } from "@/components/ui/neu-panel";
import { getBlogById } from "@/db/blogAction";
import { notFound } from "next/navigation";
import { BlogEmptyBody, BlogStatusPanel } from "@/components/Blog/BlogStatus";
import { BlogRecovery } from "@/components/Blog/BlogRecovery";
import BlogOperationBar from "@/components/Blog/BlogOperationBar";
import TOC from "@/components/Blog/TOC";
import { BlogReading } from "@/components/Blog/BlogReading";
import Content from "@/components/Content";
import { PermissionAccess } from "@/components/Auth/PermissionAccess";
import AdjacentBlogs from "@/components/Blog/AdjacentBlogs";

interface Props {
  params: Promise<{ id: string }>;
}

const Blog = async ({ params }: Props) => {
  const { id } = await params;
  const result = await getBlogById(id);
  if (result.status === "invalid_input" || result.status === "not_found") notFound();
  if (result.status !== "success") {
    return (
      <Content className="mx-auto max-w-[700px]">
        <BlogStatusPanel
          failure
          pageTitle
          title="暂时无法读取文章"
          description="文章读取暂时失败，你可以在当前位置重试。"
        >
          <BlogRecovery />
        </BlogStatusPanel>
      </Content>
    );
  }
  const { blog, isLiked, isFavorite } = result.data;

  if (!blog) {
    notFound();
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
              <h1 tabIndex={-1} className="blog-article-title" data-blog-title="">
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
            {blog.content.trim().length === 0 ? <BlogEmptyBody /> : null}
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
