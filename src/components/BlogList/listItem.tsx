import React, { FC } from "react";

import NeuDiv from "../NeuDiv/NeuDiv";
import Tag from "../Tag/tag";

import { NotionBlogProperties } from "@/lib/notion/types";

const ListItem: FC<NotionBlogProperties> = ({ properties }) => {
  // console.log(id);

  const { date, tags, Page, authors, slug } = properties;

  return (
    <NeuDiv
      neuType="raised"
      style={{ border: "2px solid var(--neu-border-color)" }}
      className="blog-list-item mb-2! text-left transition-all group duration-618 hover:transition-none"
    >
      <div className="px-1 py-0 text-2xl font-bold">
        {Page.title[0].plain_text}
      </div>
      <div className="flex flex-wrap items-center justify-between my-1">
        {authors?.people?.length ? (
          <Tag className="ml-0 transition-all duration-400 group-hover:!shadow-none">
            {authors.people.map((author) => author.name).join("/")}
          </Tag>
        ) : (
          <div></div>
        )}
        {tags.multi_select.length && (
          <ul className="flex gap-1 p-0 m-0">
            {tags.multi_select.map((tag) => {
              return (
                <Tag
                  className="transition-all duration-400 group-hover:!shadow-none"
                  style={{ color: tag.color }}
                  key={tag.id}
                >
                  {tag.name}
                </Tag>
              );
            })}
            {date?.date && (
              <Tag className="transition-all duration-400 group-hover:!shadow-none">
                {date.date.start}
              </Tag>
            )}
          </ul>
        )}
      </div>
      {/* <NeuDiv className="list-item-content">{longContent}</NeuDiv> */}
      <div className="px-1 text-md">
        <p>{slug.rich_text.map((text) => text.plain_text).join(" ")}</p>
      </div>
    </NeuDiv>
  );
};

export default ListItem;
