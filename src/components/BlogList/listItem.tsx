import React, { FC } from "react";

import NeuDiv from "../NeuDiv/NeuDiv";
import Tag from "../Tag/tag";

import { CombinedBlog } from "./BlogEditor";

const ListItem: FC<CombinedBlog> = (blog) => {
  const { author, title, createdAt, tags = [] } = blog;
  return (
    <NeuDiv
      neuType="raised"
      style={{ border: "2px solid var(--neu-border-color)" }}
      className="blog-list-item mb-2! text-left transition-all group duration-618 hover:transition-none "
    >
      <div className="px-1 py-0 text-2xl font-bold">{title}</div>
      <div className="flex flex-wrap items-center justify-between my-1">
        {author?.username ? (
          <Tag className="ml-0 transition-all duration-400 group-hover:!shadow-none">
            {author.username}
          </Tag>
        ) : (
          <div></div>
        )}
        <ul className="flex gap-1 p-0 m-0">
          {tags.map((item) => {
            return (
              <Tag key={item.tagId} color={item.tag.color}>
                {item.tag.content}
              </Tag>
            );
          })}
          {createdAt && (
            <Tag className="transition-all duration-400 group-hover:!shadow-none">
              {new Date(createdAt).toDateString()}
            </Tag>
          )}
        </ul>
      </div>
      {/* <NeuDiv className="list-item-content">{longContent}</NeuDiv> */}
      {/* <div className="px-1 text-md py-2">
        <p className="text-eclipse overflow-hidden leading-[1rem] h-[2rem]">
          {content.slice(0, 100)}
        </p>
      </div> */}
    </NeuDiv>
  );
};

export default ListItem;
