"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { DIALOG_BACKDROP_CLASS_NAME } from "@/lib/dialog-backdrop";
import {
  DIALOG_DISPLAY_SURFACE_CLASS_NAME,
  DIALOG_FORM_SURFACE_CLASS_NAME,
  DIALOG_SURFACE_CLASS_NAME,
} from "@/lib/dialog-style";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

interface DialogContentProps extends DialogPrimitive.Popup.Props {
  variant?: "form" | "display";
}

function DialogContent({ className, variant = "form", ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn("fixed inset-0 z-50 transition-opacity", DIALOG_BACKDROP_CLASS_NAME)}
      />
      <DialogPrimitive.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4">
        <DialogPrimitive.Popup
          data-variant={variant}
          className={cn(
            DIALOG_SURFACE_CLASS_NAME,
            variant === "form" ? DIALOG_FORM_SURFACE_CLASS_NAME : DIALOG_DISPLAY_SURFACE_CLASS_NAME,
            className
          )}
          {...props}
        />
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogTitle, DialogDescription };
