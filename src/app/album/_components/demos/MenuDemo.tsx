"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

type PopoverAlign = "start" | "center" | "end";

export default function MenuDemo({ compact = false }: DemoProps) {
  const [message, setMessage] = useState("尚未执行菜单操作");
  const [showSummary, setShowSummary] = useState(true);
  const [sortOrder, setSortOrder] = useState("newest");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverAlign, setPopoverAlign] = useState<PopoverAlign>("center");

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        <DropdownMenu open={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button">菜单触发器</Button>
          </DropdownMenuTrigger>
        </DropdownMenu>
        <Popover open={false}>
          <PopoverTrigger render={<Button type="button" />}>气泡触发器</PopoverTrigger>
        </Popover>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>

      <ComponentDemoGroup
        title="1. 操作菜单 DropdownMenu"
        description="用于聚合相关操作与设置，支持普通项、禁用项、复选项、单选项和层级子菜单。"
      >
        <DemoSection nested title="菜单项与本地状态">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="primary">
                打开操作菜单
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>本地样例</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setMessage("已选择编辑样例")}>
                  编辑样例
                </DropdownMenuItem>
                <DropdownMenuItem disabled>发布样例（禁用）</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showSummary}
                onCheckedChange={(checked) => setShowSummary(checked === true)}
              >
                显示摘要
              </DropdownMenuCheckboxItem>
              <DropdownMenuRadioGroup value={sortOrder} onValueChange={setSortOrder}>
                <DropdownMenuRadioItem value="newest">最新优先</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oldest">最早优先</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>更多操作</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => setMessage("已导出本地摘要")}>
                      导出摘要
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      查看快捷键
                      <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">
            摘要：{showSummary ? "显示" : "隐藏"}，排序：
            {sortOrder === "newest" ? "最新优先" : "最早优先"}
          </span>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 信息气泡 Popover"
        description="用于在当前上下文附近补充简短说明或轻量操作，并支持 start、center、end 三种对齐方式。"
      >
        <DemoSection nested title="对齐方式与受控开关">
          <div className="flex flex-wrap items-center gap-3">
            <ButtonGroup aria-label="气泡对齐方式">
              {(["start", "center", "end"] as const).map((align) => (
                <Button
                  key={align}
                  type="button"
                  aria-pressed={popoverAlign === align}
                  variant={popoverAlign === align ? "primary" : "default"}
                  onClick={() => setPopoverAlign(align)}
                >
                  {align}
                </Button>
              ))}
            </ButtonGroup>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger render={<Button type="button" />}>打开气泡说明</PopoverTrigger>
              <PopoverContent align={popoverAlign}>
                <PopoverHeader>
                  <PopoverTitle>本地信息气泡</PopoverTitle>
                  <PopoverDescription>
                    当前使用 {popoverAlign} 对齐，不会读取或写入真实数据。
                  </PopoverDescription>
                </PopoverHeader>
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={() => setPopoverOpen(false)}>
                    关闭
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}
