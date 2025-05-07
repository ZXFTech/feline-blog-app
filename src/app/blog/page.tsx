import React from "react";
import BlogList from "@/components/BlogList/blogList";
import { Metadata } from "next";
import { dataSource } from "./data";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import NeuButton from "@/components/NeuButton/neuButton";
import Link from "next/link";

export function Blog() {
  return (
    <div className="mt-7">
      <NeuDiv className="top-panel w-[95%] mx-[auto] flex flex-wrap">
        <Link href="/blog/new" className="hover:no-underline!">
          <NeuButton className="">新建</NeuButton>
        </Link>
      </NeuDiv>
      <BlogList
        dataSource={dataSource as any}
        pageBean={{ pageNum: 0, pageSize: 20, total: 5 }}
      />
    </div>
  );
}
export const metadata: Metadata = {
  title: "博客列表",
};

export default Blog;
