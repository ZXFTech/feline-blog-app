"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      <DialogContent variant="display" className="max-w-md">
        <div className="flex items-start justify-between gap-4">
          <DialogTitle className="text-lg font-semibold">{item.label}</DialogTitle>
          <Button size="icon" render={<DialogClose aria-label="关闭" />}>
            <X />
          </Button>
        </div>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          状态：{item.done ? "已确认" : "未确认"}
        </DialogDescription>
        {item.detail ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{item.detail}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
