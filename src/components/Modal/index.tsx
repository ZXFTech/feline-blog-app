/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import NeuDiv from "../NeuDiv";
import Icon, { IconType } from "../Icon";
import NeuButton from "../NeuButton";
import { ButtonType } from "../Button";
import Portal from "../Portal";

type FooterType = "ok" | "cancel" | "default" | "none";

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onOk: () => void;
  footer?: FooterType;
  okText?: string;
  cancelText?: string;
  okType?: ButtonType;
  okIcon?: IconType;
  okLoading?: boolean;
  cancelType?: ButtonType;
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
          <NeuButton
            icon={okIcon}
            loading={okLoading}
            buttonType={okType}
            onClick={onOk}
          >
            {okText}
          </NeuButton>
        )}

        {(footer === "cancel" || footer === "default") && (
          <NeuButton buttonType={cancelType} onClick={onClose}>
            {cancelText}
          </NeuButton>
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
          show ? "bg-gray-400/40!" : "bg-gray-400/0!"
        }`}
      >
        <NeuDiv
          onClick={(e) => e.stopPropagation()}
          className={`model-main flex flex-col w-[60%] min-w-100 max-w-150 min-h-50 transform transition-all duration-300 ease-in-out ${
            show ? "scale-100 opacity-100" : "scale-95 opacity-0"
          }`}
        >
          {/* Header */}
          <div className="modal-title-bar flex items-center justify-between mb-3 px-1">
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
          <div className="flex-1 px-2 mb-2">{children}</div>

          {/* Footer */}
          <div className="modal-footer flex items-center justify-end gap-2 px-1">
            {renderFooter()}
          </div>
        </NeuDiv>
      </div>
    </Portal>
  );
};

export default Modal;
