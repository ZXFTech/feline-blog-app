"use client";

import Icon from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";
import { InputField } from "@/components/ui/input-field";
import { toast } from "@/components/ProMessage";
import Tag from "@/components/Tag";
import { ProgressBar } from "@/components/ui/progress-bar";
import Content from "@/components/Content";

const Album = () => {
  return (
    <Content className="flex flex-col gap-4 px-4">
      <NeuPanel elevation="inset" className="gap-4">
        <span className="text-sm">进度条</span>
        <ProgressBar value={55} max={100} />
        <ProgressBar value={55} max={100} showLabel />
        <ProgressBar value={55} title="primary 进度条" showLabel type="primary" />
        <ProgressBar
          value={55}
          title="自定义 danger title 颜色"
          titleColor="#1aab5b"
          type="danger"
        />
        <ProgressBar title="默认 title 颜色跟随 type" value={55} type="success" />
        <ProgressBar value={55} title="自定义颜色" progressBarColor="#d315e4" type="warning" />
      </NeuPanel>
      <NeuPanel elevation="inset" layout="row" className="flex-wrap items-center gap-2">
        <span className="text-sm">toast</span>
        <Button
          onClick={() => {
            toast("普通消息");
          }}
        >
          普通消息
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            toast.info("通知");
          }}
        >
          通知
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            toast.error("错误/危险");
          }}
        >
          错误/危险
        </Button>
        <Button
          variant="warning"
          onClick={() => {
            toast.warning("警告");
          }}
        >
          警告
        </Button>
        <Button
          variant="success"
          onClick={() => {
            toast.success("成功");
          }}
        >
          成功
        </Button>
      </NeuPanel>
      <NeuPanel layout="row" className="flex-wrap items-center gap-2 m-0!">
        <span className="text-sm">icon:</span>
        <Icon theme="danger" icon="search" />
      </NeuPanel>
      <NeuPanel layout="row" className="flex-wrap items-center gap-2 m-0!">
        <span className="text-sm">button:</span>
        <Button size="xs" materialIcon="search" loading>
          测试
        </Button>
        <Button size="sm" materialIcon="search" loading>
          测试
        </Button>
        <Button materialIcon="search" loading>
          测试
        </Button>
        <Button size="lg" materialIcon="search" loading>
          测试
        </Button>
        <Button
          size="icon"
          materialIcon="search"
          aria-label="图标按钮"
          onClick={() => toast("图标按钮")}
        />
      </NeuPanel>
      <NeuPanel elevation="inset" layout="row" className="flex-wrap items-center gap-2 p-4">
        <span className="text-sm">button:</span>
        <Button loading>测试</Button>
        <Button materialIcon="search" loading>
          测试
        </Button>
      </NeuPanel>
      <NeuPanel elevation="inset" layout="row" className="flex-wrap items-center gap-2 p-4">
        <span className="text-sm">tag:</span>
        <Tag icon="search">测试</Tag>
        <Tag color="green">测试</Tag>
        <Tag icon="search" color="red" onClose={() => undefined}>
          测试
        </Tag>
        <Tag icon="search" color="red">
          测试
        </Tag>
        <Tag icon="search" color="red">
          测试
        </Tag>
      </NeuPanel>
      <NeuPanel elevation="inset" layout="row" className="flex-wrap items-center gap-2">
        <span className="text-sm">输入框</span>
        <InputField
          prefix={<Icon icon="search" size="sm" />}
          suffix={123}
          fieldSize="xs"
          defaultValue={"这是一段默认文字"}
        />
        <InputField fieldSize="sm" defaultValue={"这是一段默认文字"} />
        <InputField fieldSize="md" defaultValue={"这是一段默认文字"} />
        <InputField fieldSize="lg" defaultValue={"这是一段默认文字"} />
        <InputField
          prefix={<Icon icon="search" size="lg" />}
          suffix={123}
          fieldSize="xl"
          defaultValue={"这是一段默认文字"}
          clearable
        />
        <InputField fieldSize="2xl" defaultValue={"这是一段默认文字"} clearable />
        <InputField
          prefix={<Icon icon="search" size="2xl" />}
          suffix={123}
          clearable
          fieldSize="3xl"
          defaultValue={"这是一段默认文字"}
        />
      </NeuPanel>
    </Content>
  );
};

export default Album;
