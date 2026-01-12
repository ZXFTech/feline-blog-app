"use client";

import NeuButton from "@/components/NeuButton/neuButton";
import Icon from "../components/Icon/icon";
import NeuDiv from "@/components/NeuDiv/NeuDiv";
import Tag from "@/components/Tag/tag";
import Content from "@/components/Content/content";
import NeuInput from "@/components/NeuInput";
import { toast } from "@/components/ProMessage";

export default function Home() {
  return (
    <Content>
      <div className="neu-light px-4! py-4! flex flex-col gap-4 overflow-scroll hide-scrollbar h-full">
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2 p-4"
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
        <NeuDiv className="flex flex-wrap items-center gap-2 m-0! p-4">
          <span className="text-sm">icon:</span>
          <Icon theme="danger" icon="search" />
        </NeuDiv>
        <NeuDiv className="flex flex-wrap items-center gap-2 m-0! p-4">
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
          className="flex flex-wrap items-center gap-2 p-4"
        >
          <span className="text-sm">button:</span>
          <NeuButton loading>测试</NeuButton>
          <NeuButton icon="search" loading>
            测试
          </NeuButton>
        </NeuDiv>
        <NeuDiv
          neuType="debossed"
          className="flex flex-wrap items-center gap-2 p-4"
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
          className="flex flex-wrap items-center gap-2 p-4"
        >
          <span className="text-sm">输入框</span>
          <NeuInput
            prefix={<Icon icon="search" size="sm" />}
            suffix={123}
            inputSize="xs"
            defaultValue={"这是一段默认文字"}
          />
          <NeuInput inputSize="sm" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="md" defaultValue={"这是一段默认文字"} />
          <NeuInput inputSize="lg" defaultValue={"这是一段默认文字"} />
          <NeuInput
            prefix={<Icon icon="search" size="xl" />}
            suffix={123}
            inputSize="xl"
            defaultValue={"这是一段默认文字"}
            allowClear
          />
          <NeuInput
            inputSize="2xl"
            defaultValue={"这是一段默认文字"}
            allowClear
            onChange={(e) => console.log("e.target.value", e.target.value)}
          />
          <NeuInput
            prefix={<Icon icon="search" size="2xl" />}
            suffix={123}
            allowClear
            inputSize="3xl"
            defaultValue={"这是一段默认文字"}
            onChange={(e) => console.log("e.target.value", e.target.value)}
          />
        </NeuDiv>
      </div>
    </Content>
  );
}
