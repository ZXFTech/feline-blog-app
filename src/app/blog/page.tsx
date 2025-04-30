import React from "react";
import BlogList from "@/components/BlogList/blogList";
import { Metadata } from "next";
import { dataSource } from "./data";

export function Blog() {
  return (
    <div className="mt-7">
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
