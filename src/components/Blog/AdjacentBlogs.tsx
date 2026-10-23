"use client";

import { getAdjacentBlogs } from "@/db/blogAction";
import { AdjacentBlogsController } from "@/components/Blog/AdjacentBlogsView";

interface AdjacentBlogsProps {
  id: number;
}

export default function AdjacentBlogs({ id }: AdjacentBlogsProps) {
  return <AdjacentBlogsController id={id} load={getAdjacentBlogs} />;
}
