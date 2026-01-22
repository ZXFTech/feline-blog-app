"use client";

import { getAdjacentBlogs } from "@/db/blogAction";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import NeuButton from "../NeuButton";

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
      const { prev, next } = await getAdjacentBlogs(id);

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
        <NeuButton icon="Chevron_Left">加载中...</NeuButton>
        <NeuButton suffixIcon="Chevron_Right">加载中...</NeuButton>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center mt-2 ">
      {adjacentBlogs.prev ? (
        <NeuButton
          icon="Chevron_Left"
          onClick={() => router.replace("/blog/" + adjacentBlogs.prev?.id)}
        >
          {adjacentBlogs.prev?.title}
        </NeuButton>
      ) : (
        <NeuButton disabled icon="First_Page">
          已经是最新啦
        </NeuButton>
      )}
      {adjacentBlogs.next ? (
        <NeuButton
          suffixIcon="Chevron_Right"
          onClick={() => router.replace("/blog/" + adjacentBlogs.next?.id)}
        >
          {adjacentBlogs.next?.title}
        </NeuButton>
      ) : (
        <NeuButton disabled suffixIcon="Last_Page">
          已经到最后啦
        </NeuButton>
      )}
    </div>
  );
}

export default AdjacentBlogs;
