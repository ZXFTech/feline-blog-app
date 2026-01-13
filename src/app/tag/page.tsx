import Content from "@/components/Content";
import TagOperator from "@/components/Tag/TagOperator";
import TagShowCase from "@/components/Tag/TagShowCase";
import { getAllTags } from "@/db/tagAction";
import React from "react";
import { Tag as ITag } from "../../../generated/prisma/client";

export type CountedTag = ITag & {
  _count: { blogs?: number; todos?: number };
  count: number;
};

async function TagPage({ searchParams }) {
  const { show, orderBy } = await searchParams;
  const { tags, max } = await getAllTags(show || "todos", orderBy);
  return (
    <Content>
      <TagOperator />
      <TagShowCase tags={tags} max={max} />
    </Content>
  );
}

export default TagPage;
