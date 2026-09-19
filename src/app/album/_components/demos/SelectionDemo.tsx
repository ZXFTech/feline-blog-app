"use client";

import { useState } from "react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roles = [
  { value: "design", label: "设计" },
  { value: "frontend", label: "前端开发" },
  { value: "backend", label: "后端开发" },
] as const;

const cities = ["上海", "杭州", "成都", "深圳"] as const;

function SelectExample({
  ariaLabel,
  size = "default",
  disabled = false,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  size?: "sm" | "default";
  disabled?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const selectedLabel = roles.find((role) => role.value === value)?.label;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className="min-w-40" size={size}>
        <SelectValue placeholder="请选择角色">{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>产品团队</SelectLabel>
          {roles.slice(0, 1).map((role) => (
            <SelectItem key={role.value} value={role.value}>
              {role.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>工程团队</SelectLabel>
          {roles.slice(1).map((role) => (
            <SelectItem key={role.value} value={role.value}>
              {role.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ComboboxExample({ disabled = false }: { disabled?: boolean }) {
  return (
    <Combobox items={cities} defaultValue={disabled ? "成都" : "杭州"} disabled={disabled}>
      <ComboboxInput
        aria-label={disabled ? "禁用城市选择" : "搜索城市"}
        className="min-w-52"
        placeholder="搜索城市"
        showClear={!disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>没有匹配的城市</ComboboxEmpty>
        <ComboboxList>
          {(city) => (
            <ComboboxItem key={city} value={city}>
              {city}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export default function SelectionDemo({ compact = false }: DemoProps) {
  const [role, setRole] = useState("frontend");

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <SelectExample ariaLabel="主题代表角色选择" value="frontend" />
        <ComboboxExample />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="1. 固定选择 Select"
        description="用于从已知选项中选择一个值，支持两档尺寸、分组、占位、已选择和禁用状态。"
      >
        <DemoSection nested title="尺寸与选择状态">
          <SelectExample ariaLabel="默认尺寸角色选择" value={role} onValueChange={setRole} />
          <SelectExample ariaLabel="小尺寸角色选择" size="sm" value="design" />
          <SelectExample ariaLabel="未选择角色" />
          <SelectExample ariaLabel="禁用角色选择" disabled value="backend" />
          <p aria-live="polite" className="text-sm text-muted-foreground">
            当前角色：{roles.find((item) => item.value === role)?.label}
          </p>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 搜索选择 Combobox"
        description="用于在较长选项中输入筛选，支持清空、无匹配结果和禁用状态。"
      >
        <DemoSection nested title="搜索、清空与禁用状态">
          <ComboboxExample />
          <ComboboxExample disabled />
          <p className="max-w-xl text-sm text-muted-foreground">
            输入不存在的城市可查看空结果，点击清除按钮可恢复未选择状态。
          </p>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}
