"use client";

import NeuButton from "@/components/NeuButton/neuButton";
import Button from "../components/Button/button";
import Icon from "../components/Icon/icon";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";
import { message } from "@/lib/message";
import Content from "@/components/Content/content";

export default function Home() {
  return (
    <Content>
      <div className="neu-light px-4! py-4! flex flex-col gap-4">
        <NeuDiv className="flex flex-wrap items-center gap-2 m-0!">
          <span className="text-sm">icon:</span>
          <Icon theme="danger" icon="search" />
        </NeuDiv>
        <NeuDiv className="flex flex-wrap items-center gap-2 m-0!">
          <span className="text-sm">button:</span>
          <Button icon="search" loading>
            测试
          </Button>
          <NeuButton icon="search" loading>
            测试
          </NeuButton>
        </NeuDiv>
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-sm">button:</span>
          <Button icon="search" loading>
            测试
          </Button>
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
          <span className="text-sm">消息提示</span>
          <NeuButton onClick={() => message.info("普通消息")}>
            普通消息
          </NeuButton>
          <NeuButton onClick={() => message.success("成功")}>成功</NeuButton>
          <NeuButton onClick={() => message.warning("警告")}>警告</NeuButton>
          <NeuButton onClick={() => message.error("错误")}>错误</NeuButton>
        </NeuDiv>
      </div>
    </Content>
  );
}
