"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { DIALOG_BACKDROP_CLASS_NAME } from "@/lib/dialog-backdrop";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogContent({ className, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn("fixed inset-0 z-50 transition-opacity", DIALOG_BACKDROP_CLASS_NAME)}
      />
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
        <DialogPrimitive.Popup
          className={cn(
            "w-full rounded-xl bg-background p-[var(--spacing-panel-inset-comfortable)] text-foreground shadow-neu-raised outline-none",
            className
          )}
          {...props}
        />
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
