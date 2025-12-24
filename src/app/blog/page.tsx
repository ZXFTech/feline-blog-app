"use client";

import React, { useEffect, useState } from "react";
import BlogList, { pageBean } from "@/components/BlogList/blogList";
import NeuButton from "@/components/NeuButton/neuButton";
import Link from "next/link";
import Content from "@/components/Content/content";
import { Blog as IBlog, User } from "../../../generated/prisma/client";
import { ActionResponse } from "@/lib/response/ApiResponse";
import { toast } from "@/components/ProMessage";

export default function Blog() {
  const [blogs, setBlogs] = useState<(IBlog & { author: User })[]>([]);

  const getBLogList = async () => {
    const res = await fetch("/api/blog", {
      method: "POST",
      body: JSON.stringify({
        pageNum: 1,
        pageSize: 20,
      }),
    });
    const result = await res.json();
    const {
      error,
      message: errMessage,
      data,
    } = result as ActionResponse<{
      blogs: (IBlog & { author: User })[];
      pageBean: pageBean;
      total: number;
    }>;
    if (error || !data) {
      toast.error(errMessage);
      setBlogs([]);
      return;
    }
    setBlogs(data.blogs || []);
  };

  useEffect(() => {
    getBLogList();
  }, []);

  return (
    <Content>
      <div className="top-panel mx-3 my-1 flex-row-reverse py-1 flex flex-wrap">
        <Link href="/blog/new" className="hover:no-underline!">
          <NeuButton icon="add_box" className="">
            新建
          </NeuButton>
        </Link>
      </div>
      <BlogList dataSource={blogs} />
    </Content>
  );
}
