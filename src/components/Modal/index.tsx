"use client";

import {
  MouseEventHandler,
  ReactElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import { createPortal } from "react-dom";
import Icon, { IconType } from "../Icon/icon";
import NeuButton from "../NeuButton/neuButton";
import { ButtonType } from "../Button/button";

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
  const mouseDownRef = useRef<EventTarget | null>(null);
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const timer = setTimeout(() => {
        setShow(true);
      }, 30);
      return () => {
        clearTimeout(timer);
      };
    } else {
      setShow(false);
      const timer = setTimeout(() => {
        setMounted(false);
      }, 300);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [visible]);

  const handleMouseDown: MouseEventHandler<HTMLDivElement> = (e) => {
    mouseDownRef.current = e.target;
  };

  const handleMaskClick: MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === mouseDownRef.current) {
      onClose();
    }
  };

  useEffect(() => {
    if (!show) {
    }
  }, [show]);

  const Footer = (): ReactElement | null => {
    if (footer === "none") {
      return null;
    }

    return (
      <>
        {footer === "ok" ||
          (footer === "default" && (
            <NeuButton
              icon={okIcon}
              loading={okLoading}
              buttonType={okType}
              onClick={onOk}
            >
              {okText || "确认"}
            </NeuButton>
          ))}
        {footer === "cancel" ||
          (footer === "default" && (
            <NeuButton buttonType={cancelType} onClick={onClose}>
              {cancelText || "取消"}
            </NeuButton>
          ))}
      </>
    );
  };

  if (mounted && document) {
    return createPortal(
      <div
        onClick={handleMaskClick}
        onMouseDown={handleMouseDown}
        className={`model-mask ${
          mounted ? "fixed" : "hidden"
        } z-999999999 transition-all duration-300 ease-in-out right-0 top-0  bottom-0 left-0 flex items-center justify-center flex-col ${
          show ? "bg-gray-400/40" : "bg-gray-400/0"
        }`}
      >
        <NeuDiv
          onClick={(e) => e.stopPropagation()}
          className={`model-main flex flex-col min-w-100 min-h-50 ${
            !show ? "scale-99 opacity-0" : "scale-100 opacity-100"
          } transition-all duration-300 ease-in-out`}
        >
          <div className="modal-title-bar flex items-center justify-between mb-3 px-1">
            <div className="text-lg font-medium">{title || ""}</div>
            <div className="leading-0">
              {closeIcon ? (
                <Icon
                  onClick={onClose}
                  size="sm"
                  className="cursor-pointer transition-all duration-200 hover:rotate-180"
                  icon={closeIcon === true ? "close" : closeIcon}
                />
              ) : null}
            </div>
          </div>
          <div className="flex-1">{children}</div>
          <div className="modal-footer flex items-center justify-end">
            <Footer />
          </div>
        </NeuDiv>
      </div>,
      document.body
    );
  }
  return null;
};

export default Modal;
