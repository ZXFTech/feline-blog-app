"use client";

import { useId, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* 表单值类型                                                          */
/* ------------------------------------------------------------------ */

/** 有效期类型：不设置 / 指定日期时间 */
export type ExpiresAtKind = "none" | "datetime";

export interface ChecklistFormExpiresAt {
  kind: ExpiresAtKind;
  /** 本地日期时间，格式 "YYYY-MM-DDTHH:mm"（datetime-local 输入值，显示为 YYYY-MM-DD HH:mm） */
  localDateTime: string;
}

/** 主题色可选项：值取自 Figma 八个主题组件的边框颜色 */
export const THEME_COLOR_OPTIONS = [
  { value: "#20c997", label: "青" },
  { value: "#0d6efd", label: "蓝" },
  { value: "#6f42c1", label: "紫" },
  { value: "#52c41a", label: "绿" },
  { value: "#fadb14", label: "琥珀" },
  { value: "#fd7e14", label: "橙" },
  { value: "#d63384", label: "玫红" },
  { value: "#6c757d", label: "灰" },
] as const;

/** 清单项类型：已存在（编辑）/ 新增 */
export type ItemKind = "existing" | "new";

export interface ChecklistFormItem {
  kind: ItemKind;
  /** 已存在项的服务端 id（新增项为空） */
  itemId?: string;
  /** 已存在项的乐观并发版本号（新增项为空） */
  expectedRevision?: number;
  /** 新增项的稳定标识，独立字段，绝不复用 RHF field.id */
  clientKey: string;
  name: string;
  detail: string;
}

export interface ChecklistFormValues {
  name: string;
  themeColor: string;
  expiresAt: ChecklistFormExpiresAt;
  items: ChecklistFormItem[];
}

export interface ChecklistFormProps {
  mode: "create" | "edit";
  initialValues: ChecklistFormValues;
  /** 提交回调，由外部负责持久化；抛错会显示为根级错误 */
  onSubmit: (values: ChecklistFormValues) => Promise<void> | void;
  onCancel: () => void;
}

/* ------------------------------------------------------------------ */
/* 内部小型输入控件（复用 Neu 拟态令牌，不引入新组件体系）             */
/* ------------------------------------------------------------------ */

const fieldSurface =
  "w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground shadow-neu-inset-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/60";

/** 操作目标最小 44×44 的高度基线 */
const controlMinH = "min-h-11";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* 日期时间选择器（shadcn Calendar + Popover + 时间输入，仅日期时间无时区） */
/* ------------------------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" -> Date（本地时区，用于日历高亮） */
function parseLocalDateTime(value: string): Date | undefined {
  if (!value) return undefined;
  const [datePart, timePart] = value.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = (timePart ?? "00:00").split(":").map(Number);
  if (!y || !mo || !d) return undefined;
  return new Date(y, mo - 1, d, h || 0, mi || 0);
}

/** Date -> "YYYY-MM-DD" */
function toDatePart(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface DateTimePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}

function DateTimePicker({ id, value, onChange, invalid, describedBy }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseLocalDateTime(value);
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";

  const handleSelectDate = (d?: Date) => {
    if (!d) return;
    onChange(`${toDatePart(d)}T${timePart || "09:00"}`);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    if (!t) {
      onChange("");
      return;
    }
    onChange(`${datePart || toDatePart(new Date())}T${t}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          fieldSurface,
          controlMinH,
          "flex items-center justify-between gap-2 text-left",
          !value && "text-muted-foreground"
        )}
      >
        <span>{value ? value.replace("T", " ") : "选择日期时间"}</span>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto bg-background p-0 shadow-neu-raised-sm ring-0"
      >
        <Calendar mode="single" selected={selectedDate} onSelect={handleSelectDate} autoFocus />
        <div className="flex items-center gap-3 border-t border-border p-3">
          <label htmlFor={`${id}-time`} className="text-sm font-medium">
            时间
          </label>
          <input
            id={`${id}-time`}
            type="time"
            value={timePart}
            onChange={handleTimeChange}
            className={cn(fieldSurface, "min-h-9 flex-1")}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* ChecklistForm                                                       */
/* ------------------------------------------------------------------ */

export function ChecklistForm({ mode, initialValues, onSubmit, onCancel }: ChecklistFormProps) {
  const uid = useId();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ChecklistFormValues>({
    defaultValues: initialValues,
    mode: "onBlur",
  });

  // items 只实例化一次；渲染 key 使用 RHF 生成的 field.id
  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const expiresKind = useWatch({ control, name: "expiresAt.kind" });
  const themeColor = useWatch({ control, name: "themeColor" });

  const submit = handleSubmit(async (values) => {
    clearErrors("root");
    try {
      await onSubmit(values);
    } catch (e) {
      setError("root", {
        message: e instanceof Error ? e.message : "提交失败，请稍后重试",
      });
    }
  });

  const addItem = () => {
    append({
      kind: "new",
      clientKey:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: "",
      detail: "",
    });
  };

  const title = mode === "create" ? "创建清单" : "编辑清单";
  const submitLabel = mode === "create" ? "创建清单" : "保存修改";

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {/* 标题区 */}
      <div>
        <h2 className="text-xl font-bold text-balance">{title}</h2>
      </div>

      {/* 根级错误 */}
      {errors.root?.message && (
        <div role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </div>
      )}

      {/* 清单名 */}
      <div>
        <label htmlFor={`${uid}-name`} className="mb-1.5 block text-sm font-medium">
          清单名
        </label>
        <input
          id={`${uid}-name`}
          type="text"
          placeholder="例如：季度产品发布验收清单"
          className={cn(fieldSurface, controlMinH)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${uid}-name-err` : undefined}
          {...register("name", {
            required: "请填写清单名",
            maxLength: { value: 60, message: "清单名不超过 60 个字符" },
          })}
        />
        <FieldError id={`${uid}-name-err`} message={errors.name?.message} />
      </div>

      {/* 主题色：八个固定可选颜色 */}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">主题色</legend>
        <div
          role="radiogroup"
          aria-label="主题色"
          aria-invalid={errors.themeColor ? true : undefined}
          aria-describedby={errors.themeColor ? `${uid}-theme-err` : undefined}
          className="flex flex-wrap gap-3"
        >
          {THEME_COLOR_OPTIONS.map((opt) => {
            const selected = themeColor === opt.value;
            return (
              <label key={opt.value} className="relative flex cursor-pointer" title={opt.label}>
                <input
                  type="radio"
                  value={opt.value}
                  className="peer sr-only"
                  {...register("themeColor", { required: "请选择主题色" })}
                />
                <span
                  aria-hidden
                  className={cn(
                    "flex size-[33px] items-center justify-center rounded-lg bg-background shadow-neu-raised-sm transition-shadow",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60",
                    selected && "shadow-neu-inset-sm"
                  )}
                >
                  <span
                    className="size-[18px] rounded-full"
                    style={{ backgroundColor: opt.value }}
                  />
                </span>
                <span className="sr-only">{opt.label}</span>
              </label>
            );
          })}
        </div>
        <FieldError id={`${uid}-theme-err`} message={errors.themeColor?.message} />
      </fieldset>

      {/* 有效期：勾选表示指定截止日期时间，不勾选表示不指定 */}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">有效期</legend>
        <div className="flex items-center gap-3 min-h-11">
          <Checkbox
            id={`${uid}-exp-toggle`}
            checked={expiresKind === "datetime"}
            onCheckedChange={(checked) =>
              setValue("expiresAt.kind", checked ? "datetime" : "none", {
                shouldValidate: true,
              })
            }
          />
          <label htmlFor={`${uid}-exp-toggle`} className="text-sm cursor-pointer">
            指定截止日期时间
          </label>
        </div>
        {/* kind 作为受控隐藏字段随表单提交 */}
        <input type="hidden" {...register("expiresAt.kind")} />

        {expiresKind === "datetime" && (
          <div>
            <label htmlFor={`${uid}-exp-dt`} className="mb-1.5 block text-sm font-medium">
              截止日期时间
            </label>
            <Controller
              control={control}
              name="expiresAt.localDateTime"
              rules={{
                validate: (v) => expiresKind !== "datetime" || !!v || "请填写截止日期时间",
              }}
              render={({ field }) => (
                <DateTimePicker
                  id={`${uid}-exp-dt`}
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!errors.expiresAt?.localDateTime}
                  describedBy={errors.expiresAt?.localDateTime ? `${uid}-exp-dt-err` : undefined}
                />
              )}
            />
            <FieldError
              id={`${uid}-exp-dt-err`}
              message={errors.expiresAt?.localDateTime?.message}
            />
          </div>
        )}
      </fieldset>

      {/* 清单项 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">清单项（{fields.length}）</p>
          <Button type="button" variant="default" onClick={addItem} className="min-h-11 gap-1.5">
            <Plus className="size-4" />
            添加清单项
          </Button>
        </div>

        {fields.length === 0 && (
          <p className="rounded-lg bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
            暂无清单项，点击「添加清单项」新增。
          </p>
        )}

        <ul className="flex flex-col gap-4">
          {fields.map((field, index) => {
            const nameErr = errors.items?.[index]?.name?.message;
            return (
              // 渲染 key 使用 RHF field.id，与业务字段 clientKey 相互独立
              <li key={field.id} className="rounded-lg border border-border bg-background p-4">
                {/* kind / itemId / expectedRevision / clientKey 为受控隐藏字段，用户不可编辑 */}
                <input type="hidden" {...register(`items.${index}.kind` as const)} />
                <input type="hidden" {...register(`items.${index}.itemId` as const)} />
                <input type="hidden" {...register(`items.${index}.expectedRevision` as const)} />
                <input type="hidden" {...register(`items.${index}.clientKey` as const)} />

                <div className="flex flex-col gap-3">
                  <div>
                    <label
                      htmlFor={`${uid}-item-${field.id}-name`}
                      className="mb-1.5 block text-sm font-medium"
                    >
                      清单项名称
                    </label>
                    <input
                      id={`${uid}-item-${field.id}-name`}
                      type="text"
                      placeholder="例如：完成回归测试"
                      className={cn(fieldSurface, controlMinH)}
                      aria-invalid={nameErr ? true : undefined}
                      aria-describedby={nameErr ? `${uid}-item-${field.id}-name-err` : undefined}
                      {...register(`items.${index}.name` as const, {
                        required: "请填写清单项名称",
                        maxLength: { value: 80, message: "不超过 80 个字符" },
                      })}
                    />
                    <FieldError id={`${uid}-item-${field.id}-name-err`} message={nameErr} />
                  </div>

                  <div>
                    <label
                      htmlFor={`${uid}-item-${field.id}-detail`}
                      className="mb-1.5 block text-sm font-medium"
                    >
                      清单项详情
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">选填</span>
                    </label>
                    <textarea
                      id={`${uid}-item-${field.id}-detail`}
                      rows={2}
                      placeholder="补充说明、上下文或验收标准…"
                      className={cn(fieldSurface, "resize-y")}
                      {...register(`items.${index}.detail` as const)}
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="danger"
                      size="icon"
                      onClick={() => remove(index)}
                      aria-label={`移除第 ${index + 1} 项`}
                      className="size-8 [&_svg]:size-4"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 操作区 */}
      <div className="flex items-center justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="default"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-11 min-w-24"
        >
          取消
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting}
          className="min-h-11 min-w-24"
        >
          {isSubmitting ? "提交中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
