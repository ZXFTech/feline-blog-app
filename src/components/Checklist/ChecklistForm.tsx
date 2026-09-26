"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { Calendar as CalendarIcon, Plus } from "lucide-react";
import { ChecklistItemCard } from "@/components/Checklist/ChecklistItemCard";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useChecklistFormHeight } from "@/hooks/useChecklistFormHeight";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChecklistItemGrid } from "@/hooks/useChecklistItemGrid";
import { usePlatformShortcut } from "@/hooks/usePlatformShortcut";
import { ChecklistItemEditDialog } from "@/components/Checklist/ChecklistItemEditDialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { THEME_COLOR_OPTIONS } from "@/lib/checklists/constants";
import { cn } from "@/lib/utils";

export { THEME_COLOR_OPTIONS } from "@/lib/checklists/constants";

export type ExpiresAtKind = "none" | "datetime";

export interface ChecklistFormExpiresAt {
  kind: ExpiresAtKind;
  localDateTime: string;
}

export type ItemKind = "existing" | "new";

export interface ChecklistFormItem {
  kind: ItemKind;
  itemId?: string;
  expectedRevision?: number;
  clientKey: string;
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
  onSubmit: (values: ChecklistFormValues) => Promise<void> | void;
  onCancel: () => void;
  deadlineRequired?: boolean;
  requireItem?: boolean;
  fillHeight?: boolean;
}

interface ItemFieldsValue {
  detail: string;
}

const fieldSurface =
  "w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground shadow-neu-inset-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/60";
const controlMinH = "min-h-11";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-destructive">
      {message}
    </p>
  );
}

function itemDetailRule(value: string) {
  const normalized = value.trim().normalize("NFC");
  if (!normalized) return "请填写清单项详情";
  if (Array.from(normalized).length > 2000) return "项目详情不超过 2000 个字符";
  return true;
}

interface ChecklistItemFieldsProps {
  id: string;
  disabled: boolean;
  register: ReturnType<typeof useForm<ItemFieldsValue>>["register"];
  error?: string;
  autoFocus?: boolean;
}

function ChecklistItemFields({
  id,
  disabled,
  register,
  error,
  autoFocus,
}: ChecklistItemFieldsProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        清单项详情
      </label>
      <textarea
        id={id}
        rows={3}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder="例如：确认护照有效期，并准备一份复印件"
        className={cn(fieldSurface, "resize-y")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...register("detail", { validate: itemDetailRule })}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

function parseLocalDateTime(value: string): Date | undefined {
  if (!value) return undefined;
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day, hour || 0, minute || 0);
}

function toDatePart(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface DateTimePickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

function DateTimePicker({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  disabled,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const timeOpen = useRef(false);
  const [collisionPadding, setCollisionPadding] = useState({
    top: 12,
    bottom: 12,
    left: 12,
    right: 12,
  });
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const root = getComputedStyle(document.documentElement);
      const inset =
        parseFloat(root.getPropertyValue("--spacing-panel-inset-default")) *
        parseFloat(root.fontSize);
      const nav = document.querySelector(".navbar")?.getBoundingClientRect();
      const footer = document.querySelector("footer")?.getBoundingClientRect();
      setCollisionPadding({
        top: (nav?.bottom ?? 0) + inset,
        bottom: (footer ? innerHeight - footer.top : 0) + inset,
        left: inset,
        right: inset,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [open]);
  const selectedDate = parseLocalDateTime(value);
  const datePart = value ? value.slice(0, 10) : "";
  const timePart = value ? value.slice(11, 16) : "";
  const valueId = `${id}-value`;
  const ariaDescribedBy = [valueId, describedBy].filter(Boolean).join(" ");

  return (
    <Popover
      open={open}
      onOpenChange={(next, event) => {
        if (!next && timeOpen.current) {
          event.cancel();
          return;
        }
        setOpen(next);
      }}
    >
      <div className="flex items-center justify-start gap-2">
        <span id={valueId} className={cn("text-left text-sm", !value && "text-muted-foreground")}>
          {value ? value.replace("T", " ") : "请选择截止日期时间"}
        </span>
        <Button
          size="icon"
          disabled={disabled}
          aria-label="选择截止日期时间"
          render={
            <PopoverTrigger
              id={id}
              type="button"
              aria-invalid={invalid || undefined}
              aria-describedby={ariaDescribedBy}
            />
          }
        >
          <CalendarIcon aria-hidden />
        </Button>
      </div>
      <PopoverContent
        collisionPadding={collisionPadding}
        ref={setPortalContainer}
        align="end"
        className="max-h-(--available-height) w-auto overflow-y-auto bg-background p-0 shadow-neu-raised-sm ring-0"
      >
        <Calendar
          disabled={disabled}
          mode="single"
          selected={selectedDate}
          onSelect={(date) => date && onChange(`${toDatePart(date)}T${timePart || "09:00"}`)}
          autoFocus
        />
        <div className="flex items-center gap-3 border-t border-border p-3">
          <span className="text-sm font-medium">时间</span>
          {(["hour", "minute"] as const).map((part) => (
            <Select
              key={part}
              disabled={disabled}
              value={timePart ? timePart.split(":")[part === "hour" ? 0 : 1] : ""}
              onOpenChange={(next) => {
                timeOpen.current = next;
              }}
              onValueChange={(next) => {
                const [hour = "09", minute = "00"] = (timePart || "09:00").split(":");
                onChange(
                  (datePart || toDatePart(new Date())) +
                    "T" +
                    (part === "hour" ? next : hour) +
                    ":" +
                    (part === "minute" ? next : minute)
                );
              }}
            >
              <SelectTrigger
                aria-label={part === "hour" ? "小时" : "分钟"}
                className="min-h-11 min-w-20 border-0 bg-background text-foreground shadow-neu-inset-sm dark:bg-background dark:hover:bg-muted"
              >
                <SelectValue placeholder={part === "hour" ? "小时" : "分钟"} />
              </SelectTrigger>
              <SelectContent
                portalContainer={portalContainer}
                position="popper"
                collisionPadding={collisionPadding}
                className="min-w-20 bg-background p-[var(--spacing-panel-inset-default)] text-foreground shadow-neu-raised-sm ring-0"
                onEscapeKeyDown={(event) => event.stopPropagation()}
              >
                {Array.from({ length: part === "hour" ? 24 : 60 }, (_, index) => (
                  <SelectItem
                    key={index}
                    value={pad(index)}
                    className="min-h-11 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus:bg-muted focus:text-foreground"
                  >
                    {pad(index)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ChecklistForm({
  mode,
  initialValues,
  onSubmit,
  onCancel,
  deadlineRequired = false,
  requireItem = false,
  fillHeight = false,
}: ChecklistFormProps) {
  const uid = useId();
  const height = useChecklistFormHeight(fillHeight);
  const [submitting, setSubmitting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<number | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<ChecklistFormValues | null>(null);
  const editTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const parent = useForm<ChecklistFormValues>({ defaultValues: initialValues, mode: "onSubmit" });
  const composer = useForm<ItemFieldsValue>({ defaultValues: { detail: "" } });
  const { fields, prepend, remove, update } = useFieldArray({
    control: parent.control,
    name: "items",
  });
  const expiresKind = useWatch({ control: parent.control, name: "expiresAt.kind" });
  const itemGrid = useChecklistItemGrid<HTMLUListElement>(fields.length);
  const shortcut = usePlatformShortcut();
  const themeColor = useWatch({ control: parent.control, name: "themeColor" });

  const persist = async (values: ChecklistFormValues) => {
    parent.clearErrors("root");
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      parent.setError("root", {
        message: error instanceof Error ? error.message : "提交失败，请稍后重试",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const requestSubmit = parent.handleSubmit(async (values) => {
    if (requireItem && values.items.length === 0) {
      parent.setError("root", { message: "清单至少需要一个已添加项目" });
      return;
    }
    const snapshot = structuredClone(values);
    if (composer.getValues("detail") !== "") {
      setPendingSnapshot(snapshot);
      return;
    }
    await persist(snapshot);
  });

  const addItem = composer.handleSubmit((value) => {
    if (fields.length >= 200) {
      composer.setError("detail", { message: "每份清单最多添加 200 个项目" });
      return;
    }
    prepend({
      kind: "new",
      clientKey: crypto.randomUUID(),
      detail: value.detail.trim().normalize("NFC"),
    });
    composer.reset({ detail: "" });
    requestAnimationFrame(() => document.getElementById(`${uid}-composer-detail`)?.focus());
  });

  const openEditor = (index: number) => {
    setEditTarget(index);
  };

  const saveEditor = (detail: string) => {
    if (editTarget === null) return;
    const current = fields[editTarget];
    update(editTarget, { ...current, detail });
    setEditTarget(null);
    requestAnimationFrame(() => editTriggerRefs.current.get(current.clientKey)?.focus());
  };

  const closeEditor = () => {
    if (editTarget !== null) {
      const current = fields[editTarget];
      setEditTarget(null);
      requestAnimationFrame(() => editTriggerRefs.current.get(current.clientKey)?.focus());
    }
  };

  const title = mode === "create" ? "创建清单" : "编辑清单";
  const currentZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <form
      ref={height.formRef}
      onSubmit={requestSubmit}
      onKeyDown={(event) => {
        if (
          event.key !== "Enter" ||
          !shortcut.matches(event) ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          !event.currentTarget.contains(event.target as Node)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (
          event.repeat ||
          submitting ||
          composer.formState.isSubmitting ||
          fields.length >= 200 ||
          !composer.getValues("detail").trim()
        )
          return;
        void addItem();
      }}
      noValidate
      className={cn(
        "@container flex flex-col gap-2",
        fillHeight && "checklist-form-fill h-full min-h-0 [&>*]:shrink-0"
      )}
      aria-busy={submitting}
    >
      {!fillHeight ? (
        <div>
          <h2 className="text-xl font-bold text-balance">{title}</h2>
        </div>
      ) : null}
      {parent.formState.errors.root?.message ? (
        <div role="alert" className="text-sm text-destructive">
          {parent.formState.errors.root.message}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-1.5 block text-sm font-medium">
            清单名
          </label>
          <input
            id={`${uid}-name`}
            disabled={submitting}
            placeholder="例如：季度产品发布验收清单"
            className={cn(fieldSurface, controlMinH)}
            aria-invalid={parent.formState.errors.name ? true : undefined}
            aria-describedby={parent.formState.errors.name ? `${uid}-name-error` : undefined}
            {...parent.register("name", {
              validate: (value) => {
                const length = Array.from(value.trim().normalize("NFC")).length;
                return (length >= 1 && length <= 100) || "清单名需为 1 到 100 个字符";
              },
            })}
          />
          <FieldError id={`${uid}-name-error`} message={parent.formState.errors.name?.message} />
        </div>

        <fieldset className="flex flex-col gap-3" disabled={submitting}>
          <legend className="sr-only">主题色</legend>
          <div className="flex items-center gap-3">
            <span aria-hidden className="shrink-0 text-sm font-medium">
              主题色
            </span>
            <input type="hidden" {...parent.register("themeColor", { required: "请选择主题色" })} />
            <div
              role="radiogroup"
              aria-label="主题色"
              aria-invalid={parent.formState.errors.themeColor ? true : undefined}
              aria-describedby={
                parent.formState.errors.themeColor ? `${uid}-theme-error` : undefined
              }
              className={cn("flex flex-wrap gap-3", fillHeight && "gap-2")}
            >
              {THEME_COLOR_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="icon"
                  role="radio"
                  aria-checked={themeColor === option.value}
                  aria-label={option.label}
                  title={option.label}
                  className={cn("size-8", themeColor === option.value && "shadow-neu-inset-sm")}
                  onClick={() =>
                    parent.setValue("themeColor", option.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  <span aria-hidden className="flex items-center justify-center">
                    <span
                      className="size-4 rounded-full"
                      style={{ backgroundColor: option.value }}
                    />
                  </span>
                </Button>
              ))}
            </div>
          </div>
          <FieldError
            id={`${uid}-theme-error`}
            message={parent.formState.errors.themeColor?.message}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3" disabled={submitting}>
          <legend className="sr-only">{deadlineRequired ? "截止时间" : "有效期"}</legend>
          <div className="flex items-center gap-3">
            <span aria-hidden className="shrink-0 text-sm font-medium">
              {deadlineRequired ? "截止时间" : "有效期"}
            </span>
            <div className="min-w-0 flex-1">
              {!deadlineRequired ? (
                <div className="flex min-h-11 items-center gap-3">
                  <Checkbox
                    id={`${uid}-exp-toggle`}
                    checked={expiresKind === "datetime"}
                    onCheckedChange={(checked) =>
                      parent.setValue("expiresAt.kind", checked ? "datetime" : "none", {
                        shouldValidate: true,
                      })
                    }
                  />
                  <label htmlFor={`${uid}-exp-toggle`} className="cursor-pointer text-sm">
                    指定截止日期时间
                  </label>
                </div>
              ) : null}
              <input type="hidden" {...parent.register("expiresAt.kind")} />
              {expiresKind === "datetime" ? (
                <div>
                  <label htmlFor={`${uid}-expires`} className="sr-only">
                    截止日期时间
                  </label>
                  <Controller
                    control={parent.control}
                    name="expiresAt.localDateTime"
                    rules={{
                      validate: (value) =>
                        expiresKind !== "datetime" || Boolean(value) || "请填写截止日期时间",
                    }}
                    render={({ field }) => (
                      <DateTimePicker
                        id={`${uid}-expires`}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={submitting}
                        invalid={Boolean(parent.formState.errors.expiresAt?.localDateTime)}
                        describedBy={
                          parent.formState.errors.expiresAt?.localDateTime
                            ? `${uid}-expires-error`
                            : undefined
                        }
                      />
                    )}
                  />
                </div>
              ) : null}
            </div>
          </div>
          {expiresKind === "datetime" ? (
            <>
              <p className={cn("mt-1 text-xs text-muted-foreground")}>
                按当前时区 {currentZone} 保存，跨时区后仍表示同一时刻。
              </p>
              <FieldError
                id={`${uid}-expires-error`}
                message={parent.formState.errors.expiresAt?.localDateTime?.message}
              />
            </>
          ) : null}
        </fieldset>
      </div>
      <section
        aria-labelledby={`${uid}-composer-title`}
        className={cn("flex flex-col gap-3", fillHeight && "checklist-composer gap-2")}
      >
        <div>
          <h3 id={`${uid}-composer-title`} className="text-sm font-semibold">
            新增清单项
          </h3>
          <p className="text-xs text-muted-foreground">
            {fillHeight ? "快捷添加：" : "填写详情后点击添加或按 "}
            <KbdGroup>
              <Kbd aria-label={shortcut.modifierName}>{shortcut.modifier}</Kbd>
              <Kbd>Enter</Kbd>
            </KbdGroup>
            {!fillHeight && "，只有已添加列表中的项目会随清单保存。"}
          </p>
        </div>
        <ChecklistItemFields
          id={`${uid}-composer-detail`}
          disabled={submitting}
          register={composer.register}
          error={composer.formState.errors.detail?.message}
        />
        <div className="flex justify-end">
          <Button type="button" onClick={addItem} disabled={submitting || fields.length >= 200}>
            <Plus aria-hidden />
            添加
          </Button>
        </div>
      </section>

      <section
        ref={height.sectionRef}
        data-checklist-items
        aria-labelledby={`${uid}-added-title`}
        className={cn("flex min-w-0 flex-col gap-3", fillHeight && "min-h-0 flex-1")}
      >
        <h3 id={`${uid}-added-title`} className="text-sm font-semibold">
          已添加清单项（{fields.length}）
        </h3>
        <div
          ref={height.scrollRef}
          data-testid="checklist-item-scroll"
          className={cn(
            "min-w-0 overflow-auto overscroll-contain p-[var(--spacing-panel-inset-default)]",
            fillHeight && "min-h-0 flex-1"
          )}
        >
          {fields.length === 0 ? (
            <p className="rounded-lg bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
              尚未添加项目。请先在上方填写详情并点击添加。
            </p>
          ) : null}
          <ul className="checklist-item-grid" {...itemGrid}>
            {fields.map((field, index) => (
              <li
                id={field.itemId ? `item-${field.itemId}` : undefined}
                key={field.id}
                className="min-h-0 min-w-0 scroll-mt-24"
              >
                <ChecklistItemCard
                  item={{ id: field.clientKey, label: field.detail, done: false }}
                  size="md"
                  draftMode
                  showActions
                  loading={submitting}
                  editButtonRef={(node) => {
                    if (node) editTriggerRefs.current.set(field.clientKey, node);
                    else editTriggerRefs.current.delete(field.clientKey);
                  }}
                  onEdit={() => openEditor(index)}
                  onDelete={() => setRemoveTarget(index)}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className={cn("flex justify-end pt-4", fillHeight && "pt-0")}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="md"
            variant="default"
            onClick={onCancel}
            disabled={submitting}
          >
            取消
          </Button>
          <Button type="submit" size="md" variant="primary" loading={submitting}>
            {submitting ? "提交中…" : "保存"}
          </Button>
        </div>
      </div>

      {editTarget !== null ? (
        <ChecklistItemEditDialog
          open
          detail={fields[editTarget].detail}
          description="修改只保存在当前草稿中，保存整份清单后才会写入数据库。"
          onOpenChange={(open) => {
            if (!open) closeEditor();
          }}
          onSave={saveEditor}
          onDelete={() => {
            setRemoveTarget(editTarget);
            setEditTarget(null);
          }}
          deleteDisabled={requireItem && fields.length <= 1}
        />
      ) : null}

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从清单中删除这个项目？</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget === null ? "这个项目" : fields[removeTarget]?.detail}{" "}
              将从当前草稿移除。既有项目只会在整份清单保存成功后进入回收站。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={submitting || (requireItem && fields.length <= 1)}
              onClick={() => {
                if (removeTarget !== null) remove(removeTarget);
                setRemoveTarget(null);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingSnapshot !== null}
        onOpenChange={(open) => !open && setPendingSnapshot(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>有未添加的清单项内容</AlertDialogTitle>
            <AlertDialogDescription>
              继续保存将不会包含固定新增器中的这些内容。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() =>
                requestAnimationFrame(() =>
                  document.getElementById(`${uid}-composer-detail`)?.focus()
                )
              }
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={() => {
                const snapshot = pendingSnapshot;
                setPendingSnapshot(null);
                if (snapshot) void persist(snapshot);
              }}
            >
              继续保存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
