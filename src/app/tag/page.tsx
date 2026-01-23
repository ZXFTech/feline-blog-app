import Content from "@/components/Content";
import TagOperator from "@/components/Tag/TagOperator";
import TagShowCase from "@/components/Tag/TagShowCase";
import { getSortedTags } from "@/db/tagAction";
import React from "react";
import { Tag as ITag } from "../../../generated/prisma/client";

export type CountedTag = ITag & {
  _count: { blogs?: number; todos?: number };
  count: number;
};

interface Props {
  searchParams: Promise<{
    show: "blogs" | "todos";
    orderBy: "desc" | "asc" | undefined;
  }>;
}

async function TagPage({ searchParams }: Props) {
  const { show, orderBy } = await searchParams;
  const { tags, max } = await getSortedTags(show || "todos", orderBy);
  return (
    <Content>
      <TagOperator />
      <TagShowCase tags={tags} max={max} />
    </Content>
  );
}

export default TagPage;
