import React from "react";
import BlogList from "@/components/BlogList/blogList";
import { Metadata } from "next";
import { dataSource } from "./data";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import NeuButton from "@/components/NeuButton/neuButton";
import Link from "next/link";
import Content from "@/components/Content/content";

export function Blog() {
  return (
    <Content>
      {/* <div className="top-panel mx-3 my-1 flex-row-reverse py-1 flex flex-wrap">
        <Link href="/blog/new" className="hover:no-underline!">
          <NeuButton icon="add_box" className="">
            新建
          </NeuButton>
        </Link>
      </div> */}
      <BlogList
        dataSource={dataSource as any}
        pageBean={{ pageNum: 0, pageSize: 20, total: 5 }}
      />
    </Content>
  );
}
export const metadata: Metadata = {
  title: "博客列表",
};

export default Blog;
