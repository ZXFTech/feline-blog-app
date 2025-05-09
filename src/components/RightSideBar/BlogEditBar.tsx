"use client";

import { useRouter } from "next/navigation";
import NeuButton from "../NeuButton/neuButton";
import NeuDiv from "../NeuDiv/NeuDiv";

interface Props {
  blogId: number;
}

const BlogEditBar = ({ blogId }: Props) => {
  const router = useRouter();

  const editBlog = () => {
    router.push(`/blog/edit/${blogId}`);
  };

  return (
    <NeuDiv>
      <NeuButton icon="edit" onClick={editBlog}>
        编辑
      </NeuButton>
    </NeuDiv>
  );
};

export default BlogEditBar;
