import Head from "next/head";

import { GetStaticPaths, GetStaticProps } from "next";
import { NotionPage } from "@/lib/notion/types";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";

import NotionBlock from "@/components/NotionBlock/notionBlock";

import Image from "next/image";

import { blogData } from "./data";

const PostLayout = ({
  blogRes,
  contentRes,
  origin = "notion",
}: {
  blogRes: NotionPage;
  contentRes: any;
  origin: any;
}) => {
  // if (!blogRes && !contentRes) {
  //   return <div></div>;
  // }
  const { last_edited_time, properties } = blogData.pageProps.blogRes;
  const { Page, authors, tags } = properties;

  const contentList: any[] =
    (blogData.pageProps.contentRes?.results as any[]) || [];
  return (
    <div className="px-[5%] pt-10 pb-15 border-x overflow-auto h-[calc(100vh-5rem)] hidden-scrollbar">
      <Head>
        <title>{Page.title.map((item) => item.plain_text)}</title>
      </Head>
      <h1>{Page.title.map((item) => item.plain_text)}</h1>
      <div className="flex flex-wrap items-center justify-between">
        <Tag className="ml-0">
          {authors.people.map((author) => author.name).join("/")}
        </Tag>
        {tags.multi_select.length && (
          <ul className="flex flex-wrap gap-1 p-0 mx-0 my-3">
            {origin && <Tag>来源: {origin}</Tag>}
            {tags.multi_select.map((tag) => {
              return (
                <Tag color={tag.color} key={tag.id}>
                  {tag.name}
                </Tag>
              );
            })}
            {last_edited_time && (
              <Tag>{(new Date(last_edited_time), "yyyy-MM-dd HH:mm:ss")}</Tag>
            )}
          </ul>
        )}
      </div>
      <div className="blog-content">
        {!contentList.length ? (
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
        ) : (
          contentList.map((content) => {
            if (content.type in NotionBlock) {
              return (NotionBlock as any)[content.type](content);
            }
          })
        )}
      </div>
    </div>
  );
};

export default PostLayout;
