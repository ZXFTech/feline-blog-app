"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { StyledLink } from "@/components/ui/styled-link";

const variants = ["default", "primary", "danger", "warning", "success"] as const;
const sizes = ["xs", "sm", "md", "lg"] as const;

export default function ButtonDemo({ compact = false }: DemoProps) {
  const [clicks, setClicks] = useState(0);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setClicks((value) => value + 1)}>
          主要操作
        </Button>
        <ButtonGroup aria-label="主题代表按钮组">
          <Button>上一项</Button>
          <Button>下一项</Button>
        </ButtonGroup>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          点击 {clicks} 次
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="1. 按钮 Button"
        description="通用操作按钮，覆盖五种语义类型、四档尺寸、图标、加载和禁用状态。"
      >
        <DemoSection nested title="类型与状态（md）">
          {variants.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button disabled>禁用</Button>
          <Button loading>加载中</Button>
        </DemoSection>
        <DemoSection nested title="尺寸与图标（primary）">
          {sizes.map((size) => (
            <Button key={size} size={size} variant="primary">
              {size}
            </Button>
          ))}
          <Button aria-label="搜索" materialIcon="search" size="icon" variant="primary" />
          <Button materialIcon="search" onClick={() => setClicks((value) => value + 1)}>
            搜索
          </Button>
          <Button materialIconAfter="arrow_forward" variant="primary">
            继续
          </Button>
          <span aria-live="polite" className="text-sm text-muted-foreground">
            搜索按钮已点击 {clicks} 次
          </span>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 按钮组与链接 ButtonGroup / StyledLink"
        description="把相关操作组合成连续控件，并让页面导航链接复用按钮的视觉与状态契约。"
      >
        <DemoSection nested title="水平、垂直与链接形态">
          <ButtonGroup aria-label="文本对齐">
            <Button>左</Button>
            <Button>居中</Button>
            <Button>右</Button>
          </ButtonGroup>
          <ButtonGroup orientation="vertical" aria-label="排序方向">
            <Button>升序</Button>
            <Button>降序</Button>
          </ButtonGroup>
          <ButtonGroup>
            <ButtonGroupText>浏览</ButtonGroupText>
            <StyledLink href="/album?component=button" variant="success">
              链接形态
            </StyledLink>
          </ButtonGroup>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}
