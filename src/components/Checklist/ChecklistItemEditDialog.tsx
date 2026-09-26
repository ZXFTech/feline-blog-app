"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { usePlatformShortcut } from "@/hooks/usePlatformShortcut";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ChecklistItemEditValues {
  detail: string;
}

export interface ChecklistItemEditDialogProps {
  open: boolean;
  mode?: "create" | "edit";
  detail: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (detail: string) => Promise<void> | void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}

const fieldSurface =
  "w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground shadow-neu-inset-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/60";

function validateDetail(value: string) {
  const normalized = value.trim().normalize("NFC");
  if (!normalized) return "请填写清单项详情";
  if (Array.from(normalized).length > 2000) return "项目详情不超过 2000 个字符";
  return true;
}

export function ChecklistItemEditDialog({
  open,
  mode = "edit",
  detail,
  description = "修改后保存，清单项会立即更新。",
  onOpenChange,
  onSave,
  onDelete,
  deleteDisabled = false,
}: ChecklistItemEditDialogProps) {
  const form = useForm<ChecklistItemEditValues>({
    defaultValues: { detail },
    mode: "onSubmit",
  });
  const { isSubmitting } = form.formState;
  const shortcut = usePlatformShortcut();

  useEffect(() => {
    if (open) form.reset({ detail });
  }, [detail, form, open]);

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors("root");
    try {
      await onSave(values.detail.trim().normalize("NFC"));
      onOpenChange(false);
    } catch (error) {
      form.setError("root", {
        message: error instanceof Error ? error.message : "保存失败，请稍后重试",
      });
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent
        variant="form"
        className="max-w-lg"
        onKeyDown={(event) => {
          if (shortcut.matches(event) && event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (event.repeat || isSubmitting) return;
            void submit();
          }
        }}
      >
        <div>
          <DialogTitle>{mode === "create" ? "新增清单项" : "编辑清单项"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <div>
          <label
            htmlFor="checklist-item-editor-detail"
            className="mb-1.5 block text-sm font-medium"
          >
            清单项详情
          </label>
          <textarea
            id="checklist-item-editor-detail"
            rows={5}
            autoFocus
            disabled={isSubmitting}
            className={cn(fieldSurface, "resize-y")}
            aria-invalid={form.formState.errors.detail ? true : undefined}
            aria-describedby={
              form.formState.errors.detail ? "checklist-item-editor-detail-error" : undefined
            }
            {...form.register("detail", { validate: validateDetail })}
          />
          {form.formState.errors.detail?.message ? (
            <p
              id="checklist-item-editor-detail-error"
              role="alert"
              className="mt-1 text-xs text-destructive"
            >
              {form.formState.errors.detail.message}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          按{" "}
          <KbdGroup>
            <Kbd aria-label={shortcut.modifierName}>{shortcut.modifier}</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>{" "}
          {mode === "create" ? "添加项目。" : "保存项目。"}
        </p>
        {form.formState.errors.root?.message ? (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {onDelete ? (
              <Button
                type="button"
                variant="danger"
                disabled={isSubmitting || deleteDisabled}
                onClick={onDelete}
              >
                删除
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={isSubmitting}
              onClick={submit}
              aria-keyshortcuts={`${shortcut.modifierName === "Command" ? "Meta" : "Control"}+Enter`}
            >
              {mode === "create" ? "确认增加" : "保存项目"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
