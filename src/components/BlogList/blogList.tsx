import React, { FC } from "react";
import ListItem from "./listItem";
import Link from "next/link";
import { Blog, User } from "../../../generated/prisma";

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
  dataSource: (Blog & { author: User })[];
  pageBean?: pageBean;
}

const BlogList: FC<BlogListProps> = ({ dataSource }) => {
  return (
    <div className="scale-100% m-3">
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
    </div>
  );
};

export default BlogList;
