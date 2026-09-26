/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { MouseEventHandler, ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { NeuPanel } from "@/components/ui/neu-panel";
import { DIALOG_BACKDROP_CLASS_NAME } from "@/lib/dialog-backdrop";
import { DIALOG_FORM_SURFACE_CLASS_NAME, DIALOG_SURFACE_CLASS_NAME } from "@/lib/dialog-style";
import { cn } from "@/lib/utils";
import Icon, { IconType } from "../Icon";
import { Button } from "@/components/ui/button";
import Portal from "../Portal";

type FooterType = "ok" | "cancel" | "default" | "none";
type ModalButtonType = "default" | "primary" | "danger" | "warning" | "success";

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onOk: () => void;
  footer?: FooterType;
  okText?: string;
  cancelText?: string;
  okType?: ModalButtonType;
  okIcon?: IconType;
  okLoading?: boolean;
  cancelType?: ModalButtonType;
  closeIcon?: boolean | IconType | string;
  children?: ReactNode;
}

const ENTER_DELAY = 20;
const EXIT_DURATION = 300;

const Modal = ({
  visible,
  onClose,
  onOk,
  children,
  title,
  okLoading,
  okIcon,
  footer = "default",
  okText = "确定",
  cancelText = "取消",
  okType = "primary",
  cancelType = "default",
  closeIcon = true,
}: Props) => {
  const mouseDownTarget = useRef<EventTarget | null>(null);

  const [mounted, setMounted] = useState(visible);
  const [show, setShow] = useState(false);

  // 统一管理进入 / 退出动画
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (visible) {
      setMounted(true);
      timer = setTimeout(() => setShow(true), ENTER_DELAY);
    } else {
      setShow(false);
      timer = setTimeout(() => setMounted(false), EXIT_DURATION);
    }

    return () => clearTimeout(timer);
  }, [visible]);

  const handleMouseDown: MouseEventHandler<HTMLDivElement> = (e) => {
    mouseDownTarget.current = e.target;
  };

  const handleMaskClick: MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === mouseDownTarget.current) {
      onClose();
    }
  };

  const renderFooter = (): ReactElement | null => {
    if (footer === "none") return null;

    return (
      <>
        {(footer === "ok" || footer === "default") && (
          <Button materialIcon={okIcon} loading={okLoading} variant={okType} onClick={onOk}>
            {okText}
          </Button>
        )}

        {(footer === "cancel" || footer === "default") && (
          <Button variant={cancelType} onClick={onClose}>
            {cancelText}
          </Button>
        )}
      </>
    );
  };

  if (!mounted) return null;

  return (
    <Portal>
      <div
        onMouseDown={handleMouseDown}
        onClick={handleMaskClick}
        className={`fixed inset-0 z-1000 flex items-center justify-center transition-colors duration-300! ${
          show ? DIALOG_BACKDROP_CLASS_NAME : "bg-black/0 backdrop-blur-none"
        }`}
      >
        <NeuPanel
          data-slot="modal-panel"
          data-variant="form"
          density="comfortable"
          radius="xl"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            DIALOG_SURFACE_CLASS_NAME,
            DIALOG_FORM_SURFACE_CLASS_NAME,
            "model-main min-h-50 w-[60%] min-w-100 max-w-150 transform transition-all duration-300 ease-in-out",
            show ? "scale-100 opacity-100" : "scale-95 opacity-0"
          )}
        >
          {/* Header */}
          <div className="modal-title-bar flex items-center justify-between">
            <div className="text-lg font-medium">{title}</div>
            {closeIcon && (
              <Icon
                onClick={onClose}
                size="md"
                className="cursor-pointer transition-transform duration-200 hover:rotate-180"
                icon={closeIcon === true ? "close" : closeIcon}
              />
            )}
          </div>

          {/* Content */}
          <div className="flex-1">{children}</div>

          {/* Footer */}
          <div className="modal-footer flex items-center justify-end gap-2">{renderFooter()}</div>
        </NeuPanel>
      </div>
    </Portal>
  );
};

export default Modal;
