"use client";

import { getAdjacentBlogs } from "@/db/blogAction";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface AdjacentBlogInfo {
  id: number;
  title: string;
  createdAt: Date;
}

interface Props {
  id: number;
}

function AdjacentBlogs({ id }: Props) {
  const [adjacentBlogs, setAdjacentBlogs] = useState<{
    prev: AdjacentBlogInfo | null;
    next: AdjacentBlogInfo | null;
  }>({
    prev: null,
    next: null,
  });

  const [loading, setLoading] = useState(true);

  const router = useRouter();

  useEffect(() => {
    const getPrevAndNextBlogs = async () => {
      setLoading(true);
      const result = await getAdjacentBlogs(id);
      if (result.status !== "success") {
        setLoading(false);
        return;
      }
      const { prev, next } = result.data;

      setAdjacentBlogs({
        prev,
        next,
      });
      setLoading(false);
    };

    getPrevAndNextBlogs();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-between items-center mt-2 ">
        <Button materialIcon="Chevron_Left">加载中...</Button>
        <Button materialIconAfter="Chevron_Right">加载中...</Button>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center mt-2 ">
      {adjacentBlogs.prev ? (
        <Button
          materialIcon="Chevron_Left"
          onClick={() => router.replace("/blog/" + adjacentBlogs.prev?.id)}
        >
          {adjacentBlogs.prev?.title}
        </Button>
      ) : (
        <Button disabled materialIcon="First_Page">
          已经是最新啦
        </Button>
      )}
      {adjacentBlogs.next ? (
        <Button
          materialIconAfter="Chevron_Right"
          onClick={() => router.replace("/blog/" + adjacentBlogs.next?.id)}
        >
          {adjacentBlogs.next?.title}
        </Button>
      ) : (
        <Button disabled materialIconAfter="Last_Page">
          已经到最后啦
        </Button>
      )}
    </div>
  );
}

export default AdjacentBlogs;
