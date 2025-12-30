"use client";

import React, { useCallback, useEffect, useState } from "react";
import BlogList, { pageBean } from "@/components/BlogList/blogList";
import Content from "@/components/Content/content";
import { Blog as IBlog, User } from "../../../generated/prisma/client";
import { ActionResponse } from "@/lib/response/ApiResponse";
import { toast } from "@/components/ProMessage";
import { useSearchParams } from "next/navigation";
import { BlogOperationBar } from "@/components/BlogList/BlogOperationBar";

export default function Blog() {
  const [blogs, setBlogs] = useState<(IBlog & { author: User })[]>([]);

  const searchParams = useSearchParams().toString();

  const getBlogList = useCallback(async () => {
    const res = await fetch("/api/blog" + `?${searchParams}`);
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
  }, [searchParams]);

  useEffect(() => {
    (() => {
      getBlogList();
    })();
  }, [getBlogList, searchParams]);

  return (
    <Content>
      <BlogOperationBar />
      <BlogList dataSource={blogs} />
    </Content>
  );
}
