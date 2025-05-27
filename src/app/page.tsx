"use client";

import NeuButton from "@/components/NeuButton/neuButton";
import Icon from "../components/Icon/icon";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";
import Content from "@/components/Content/content";
import NeuInput from "@/components/NeuInput";
import { toast } from "@/components/ProMessage";
import TagEditor from "@/components/TagEditor";
import { useState } from "react";
import { Tag as ITag } from "../../generated/prisma";

export type TagData = Pick<ITag, "content" | "color"> & { id?: number };
export interface TagsCollection {
  originTags: TagData[];
  addedTags: TagData[];
  removedTags: TagData[];
  updatedTags: TagData[];
}

const fakeTags = [
  {
    content: "test1",
    color: "red",
  },
  {
    content: "test2",
    color: "green",
  },
  {
    content: "test3",
    color: "blue",
  },
  {
    content: "test4",
    color: "yellow",
  },
  {
    content: "test5",
    color: "orange",
  },
];
export default function Home() {
  const [tags, setTags] = useState<TagsCollection>({
    originTags: fakeTags,
    updatedTags: [],
    addedTags: [],
    removedTags: [],
  });
  const [tagColor, setTagColor] = useState("");
  return (
    <Content>
      <div className="neu-light px-4! py-4! flex flex-col gap-4 overflow-scroll hide-scrollbar h-full">
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2"
        >
          <TagEditor value={tags} setValue={setTags} />
        </NeuDiv>
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">toast</span>
          <NeuButton
            onClick={() => {
              toast("普通消息");
            }}
          >
            普通消息
          </NeuButton>
          <NeuButton
            buttonType="primary"
            onClick={() => {
              toast.info("通知");
            }}
          >
            通知
          </NeuButton>
          <NeuButton
            buttonType="danger"
            onClick={() => {
              toast.error("错误/危险");
            }}
          >
            错误/危险
          </NeuButton>
          <NeuButton
            buttonType="warn"
            onClick={() => {
              toast.warning("警告");
            }}
          >
            警告
          </NeuButton>
          <NeuButton
            buttonType="success"
            onClick={() => {
              toast.success("成功");
            }}
          >
            成功
          </NeuButton>
        </NeuDiv>
        <NeuDiv className="flex flex-wrap items-center gap-2 m-0!">
          <span className="text-sm">icon:</span>
          <Icon theme="danger" icon="search" />
        </NeuDiv>
        <NeuDiv className="flex flex-wrap items-center gap-2 m-0!">
          <span className="text-sm">button:</span>
          <NeuButton btnSize="xs" icon="search" loading>
            测试
          </NeuButton>
          <NeuButton btnSize="sm" icon="search" loading>
            测试
          </NeuButton>
          <NeuButton icon="search" loading>
            测试
          </NeuButton>
          <NeuButton btnSize="lg" icon="search" loading>
            测试
          </NeuButton>
        </NeuDiv>
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">button:</span>
          <NeuButton loading>测试</NeuButton>
          <NeuButton icon="search" loading>
            测试
          </NeuButton>
        </NeuDiv>
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">tag:</span>
          <Tag icon="search">测试</Tag>
          <Tag color="green">测试</Tag>
          <Tag icon="search" color="red" closable>
            测试
          </Tag>
          <Tag icon="search" color="red">
            测试
          </Tag>
          <Tag icon="search" color="red">
            测试
          </Tag>
        </NeuDiv>
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">输入框</span>
          <NeuInput inputSize="xs" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="sm" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="md" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="lg" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="xl" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="2xl" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="3xl" defaultValue={"这是一段默认文字"} />
        </NeuDiv>
      </div>
    </Content>
  );
}
