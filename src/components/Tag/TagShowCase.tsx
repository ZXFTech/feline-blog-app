import React from "react";
import NeuDiv from "../NeuDiv";
import NeuProgressBar from "../NeuProgressBar";
import { CountedTag } from "@/app/tag/page";

interface Props {
  tags: CountedTag[];
  max: number;
}

function TagShowCase({ tags, max }: Props) {
  if (!tags?.length) {
    return <div>暂无 tags</div>;
  }

  return (
    <NeuDiv
      neuType="debossed"
      className="flex flex-col m-0! p-4 gap-1 flex-wrap items-stretch"
    >
      {/* {(tags || []).map((tag, index) => {
        return (
          <>
            <Tag key={tag.id + "_" + index + tag.createdAt} color={tag.color}>
              {tag.content}
            </Tag>
            <Tag key={tag.id + "_" + index + "_" + tag.createdAt}>
              {tag._count.todos}
            </Tag>
          </>
        );
      })} */}
      {tags.map((tag) => {
        return (
          <NeuProgressBar
            key={tag.id}
            max={max}
            progressBarColor={tag.color}
            titleColor={tag.color}
            value={tag.count || 0}
            title={tag.content}
            showLabel="num"
          />
        );
      })}
    </NeuDiv>
  );
}

export default TagShowCase;
