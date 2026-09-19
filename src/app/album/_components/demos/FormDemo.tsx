"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputField } from "@/components/ui/input-field";
import { Textarea } from "@/components/ui/textarea";

export default function FormDemo({ compact = false, instanceId = "current" }: DemoProps) {
  const [checked, setChecked] = useState(true);
  const fieldId = `album-name-${instanceId}`;

  if (compact) {
    return (
      <InputField
        aria-label="主题中的搜索输入"
        defaultValue="组件搜索"
        prefix={<Search aria-hidden="true" className="size-4" />}
        clearable
      />
    );
  }

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="1. 输入控件 Input / InputField / Textarea / InputGroup"
        description="用于单行与多行文本录入，并支持尺寸、前后缀、清空、禁用和字段校验状态。"
      >
        <DemoSection nested title="尺寸与默认形态">
          {(["sm", "md", "lg", "xl"] as const).map((size) => (
            <Input
              key={size}
              aria-label={`${size} 输入框`}
              className="max-w-48"
              defaultValue={`${size} 输入框`}
              size={size}
            />
          ))}
        </DemoSection>
        <DemoSection nested title="组合、禁用与校验">
          <InputField
            aria-label="可清空搜索"
            className="max-w-64"
            defaultValue="可清空的搜索词"
            prefix={<Search aria-hidden="true" className="size-4" />}
            suffix="⌘ K"
            clearable
          />
          <Input aria-label="禁用输入" className="max-w-48" disabled defaultValue="禁用状态" />
          <Field className="max-w-56" data-invalid="true">
            <FieldLabel htmlFor={fieldId}>组件名称</FieldLabel>
            <Input
              id={fieldId}
              aria-invalid="true"
              aria-describedby={`${fieldId}-error`}
              defaultValue="?"
            />
            <FieldError id={`${fieldId}-error`}>请输入清晰的组件名称</FieldError>
          </Field>
        </DemoSection>
        <DemoSection nested title="多行输入">
          <Textarea
            aria-label="组件备注"
            className="max-w-sm"
            defaultValue="固定中文样例，可直接编辑并重置页面恢复。"
          />
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 复选框与字段 Checkbox / Field / Label"
        description="用于布尔选项和字段分组，让标签、辅助说明、选中状态及错误信息保持可访问关联。"
      >
        <DemoSection nested title="默认、选中与禁用状态">
          <Field orientation="horizontal" className="max-w-xs">
            <Checkbox id={`${fieldId}-checkbox`} checked={checked} onCheckedChange={setChecked} />
            <div>
              <FieldLabel htmlFor={`${fieldId}-checkbox`}>纳入展示目录</FieldLabel>
              <FieldDescription>演示真实可切换状态。</FieldDescription>
            </div>
          </Field>
          <Field orientation="horizontal" className="max-w-xs">
            <Checkbox id={`${fieldId}-unchecked`} />
            <FieldLabel htmlFor={`${fieldId}-unchecked`}>未选中状态</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="max-w-xs" data-disabled="true">
            <Checkbox id={`${fieldId}-disabled`} disabled checked />
            <FieldLabel htmlFor={`${fieldId}-disabled`}>禁用状态</FieldLabel>
          </Field>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}
