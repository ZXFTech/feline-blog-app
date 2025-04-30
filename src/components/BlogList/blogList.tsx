import React, { FC } from "react";
import ListItem from "./listItem";
import NeuDiv from "../NeuDiv/NeuDiv";
import Link from "next/link";
import { NotionBlogProperties } from "@/lib/notion/types";

export interface BlogListItem {
  id: number;
  title: string;
  author: string;
  summary: string;
  tags: string[];
  gmtCreate?: string;
  gmtUpdate?: string;
  content: string;
}

export interface pageBean {
  pageNum: number;
  pageSize: number;
  total: number;
}

export interface BlogListProps {
  dataSource: NotionBlogProperties[];
  pageBean: pageBean;
}

const BlogList: FC<BlogListProps> = ({ dataSource }) => {
  return (
    <NeuDiv
      neuType="debossed"
      className="scale-100% mx-3 my-0 h-[calc(100vh-8.5rem)] md:h-[calc(100vh-10rem)] overflow-auto hidden-scrollbar"
    >
      {dataSource.map((item) => {
        return (
          <Link
            key={item.id}
            href={`/blog/${item.id}`}
            style={{
              textDecoration: "none",
              color: "var(--neu-font-color)",
            }}
          >
            <ListItem {...item} />
          </Link>
        );
      })}
      {/* <div>{Object.prototype.toString.call(pageBean)}</div> */}
    </NeuDiv>
  );
};

export default BlogList;
