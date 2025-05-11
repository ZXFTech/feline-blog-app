"use server";

import React, { Suspense } from "react";
import BlogList from "@/components/BlogList/blogList";
import { Metadata } from "next";
import { dataSource } from "./data";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import NeuButton from "@/components/NeuButton/neuButton";
import Link from "next/link";
import Content from "@/components/Content/content";
import { getBlogList } from "@/db/blogAction";
import { message } from "@/lib/message";
import Loading from "../loading";

export default async function Blog() {
  const {
    data,
    error,
    message: errMessage,
  } = await getBlogList(1, 20, "test-user");
  if (error || !data) {
    message.error("获取博客列表失败!" + errMessage);
  }
  console.log("data", data);
  const { blogs, total, pageBean } = data!;
  return (
    <Suspense fallback={<Loading />}>
      <Content>
        {/* <div className="top-panel mx-3 my-1 flex-row-reverse py-1 flex flex-wrap">
        <Link href="/blog/new" className="hover:no-underline!">
          <NeuButton icon="add_box" className="">
            新建
          </NeuButton>
        </Link>
      </div> */}
        <BlogList dataSource={blogs} />
      </Content>
    </Suspense>
  );
}
