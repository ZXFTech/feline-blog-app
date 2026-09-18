"use client";

import { X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChecklistItem } from "@/lib/checklist";

export interface ChecklistItemDetailDialogProps {
  open: boolean;
  item: ChecklistItem;
  onOpenChange: (open: boolean) => void;
}

export function ChecklistItemDetailDialog({
  open,
  item,
  onOpenChange,
}: ChecklistItemDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle className="text-lg font-semibold">{item.label}</DialogTitle>
          <DialogClose
            className="inline-flex size-8 items-center justify-center rounded-md"
            aria-label="关闭"
          >
            <X className="size-4" />
          </DialogClose>
        </div>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          状态：{item.done ? "已确认" : "未确认"}
        </DialogDescription>
        <p className="mt-4 text-sm leading-6">{item.detail || "暂无详情"}</p>
      </DialogContent>
    </Dialog>
  );
}
