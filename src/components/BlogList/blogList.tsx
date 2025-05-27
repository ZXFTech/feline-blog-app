import React, { FC } from "react";
import ListItem from "./listItem";
import Link from "next/link";
import { Blog, User } from "../../../generated/prisma";

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
    </div>
  );
};

export default BlogList;
