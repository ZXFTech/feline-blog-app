"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import { toast } from "@/components/ProMessage";
import Tag from "@/components/Tag";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";

export default function FeedbackDemo({ compact = false }: DemoProps) {
  const [selected, setSelected] = useState(false);
  const [visible, setVisible] = useState(true);

  if (compact) {
    return (
      <div className="space-y-3">
        <ProgressBar value={68} type="primary" showLabel="percentage" />
        <div className="flex gap-2">
          <Badge variant="success">ready</Badge>
          <Tag>主题样例</Tag>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="1. 徽章与标签 Badge / Tag"
        description="Badge 用于紧凑状态，Tag 用于静态、可选择或可移除的分类信息。"
      >
        <DemoSection nested title="语义类型与交互状态">
          {(["default", "primary", "danger", "warning", "success"] as const).map((variant) => (
            <Badge key={variant} variant={variant}>
              {variant}
            </Badge>
          ))}
          <Tag icon="search">静态标签</Tag>
          <Tag
            color={selected ? "var(--primary)" : undefined}
            onSelect={() => setSelected((value) => !value)}
          >
            {selected ? "已选择" : "可选择"}
          </Tag>
          {visible ? (
            <Tag onClose={() => setVisible(false)}>可关闭</Tag>
          ) : (
            <Button onClick={() => setVisible(true)}>恢复标签</Button>
          )}
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 进度与消息 ProgressBar / ProMessage"
        description="ProgressBar 呈现确定进度，ProMessage 通过全局消息区域反馈操作结果。"
      >
        <DemoSection nested title="进度尺寸与语义色">
          <div className="grid min-w-64 flex-1 gap-4">
            <ProgressBar value={28} size="sm" type="default" showLabel="percentage" />
            <ProgressBar
              value={55}
              size="md"
              type="warning"
              showLabel="percentage"
              title="处理中"
            />
            <ProgressBar
              value={86}
              size="lg"
              type="success"
              showLabel="percentage"
              title="接近完成"
            />
          </div>
        </DemoSection>
        <DemoSection nested title="真实消息触发">
          <Button onClick={() => toast.info("Album 信息样例")}>信息消息</Button>
          <Button variant="success" onClick={() => toast.success("组件状态已更新")}>
            成功消息
          </Button>
          <Button variant="danger" onClick={() => toast.error("这是固定错误样例")}>
            错误消息
          </Button>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="3. 主题切换器 ThemeSwitcher"
        description="在 light、dark、sugar、warm 四套全局主题间切换，并持久化当前选择。"
      >
        <DemoSection nested title="主题选项">
          <ThemeSwitcher />
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}
