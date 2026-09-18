"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";

interface Props {
  blogId: number;
}

const BlogEditBar = ({ blogId }: Props) => {
  const router = useRouter();

  const editBlog = () => {
    router.push(`/blog/edit/${blogId}`);
  };

  return (
    <NeuSurface>
      <Button materialIcon="edit" onClick={editBlog}>
        编辑
      </Button>
    </NeuSurface>
  );
};

export default BlogEditBar;
