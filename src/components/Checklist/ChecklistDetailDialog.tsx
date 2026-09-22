"use client";

import { X } from "lucide-react";

import { ChecklistItemCard } from "@/components/Checklist/ChecklistItemCard";
import { CountdownBadge, StatusIndicator } from "@/components/Checklist/ChecklistCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Checklist, ChecklistItem } from "@/lib/checklist";

export interface ChecklistDetailDialogProps {
  open: boolean;
  checklist: Checklist;
  onOpenChange: (open: boolean) => void;
  onItemDetail?: (item: ChecklistItem) => void;
  onToggleItem?: (item: ChecklistItem) => void;
}

export function ChecklistDetailDialog({
  open,
  checklist,
  onOpenChange,
  onItemDetail,
  onToggleItem,
}: ChecklistDetailDialogProps) {
  const done = checklist.items.filter((item) => item.done).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="display"
        className="flex max-h-[calc(100svh-2rem)] max-w-5xl flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <StatusIndicator done={done} total={checklist.items.length} size={14} />
            <DialogTitle className="text-lg font-semibold">{checklist.name}</DialogTitle>
          </div>
          <Button size="icon" render={<DialogClose aria-label="关闭" />}>
            <X />
          </Button>
        </div>
        <DialogDescription className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          已完成 {done} · 总数 {checklist.items.length}
          <CountdownBadge expiresAt={checklist.expiresAt} textClass="text-sm" />
        </DialogDescription>
        <div className="mt-4 min-h-0 overflow-y-auto no-scrollbar">
          <div className="grid grid-cols-3 gap-2 p-2 sm:grid-cols-5 sm:gap-4">
            {checklist.items.map((item) => (
              <ChecklistItemCard
                key={item.id}
                item={item}
                size="md"
                onToggle={onToggleItem}
                onOpenDetail={onItemDetail}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
