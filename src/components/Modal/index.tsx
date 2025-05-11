"use client";

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import { createPortal, flushSync } from "react-dom";
import Icon, { IconType } from "../Icon/icon";

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onOk: () => void;
  closeIcon?: boolean | IconType | string;
  children?: ReactNode;
}

const Model = ({
  visible,
  onClose,
  onOk,
  children,
  title,
  closeIcon = true,
}: Props) => {
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(true);

  const handleClose = () => {
    setShow(false);
  };

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

  useEffect(() => {
    if (!show) {
    }
  }, [show]);

  if (mounted && document) {
    return createPortal(
      <div
        onClick={onClose}
        className={`model-mask ${
          mounted ? "fixed" : "hidden"
        } z-999999999 transition-all duration-300 ease-in-out right-0 top-0  bottom-0 left-0 flex items-center justify-center flex-col ${
          show ? "bg-gray-400/40" : "bg-gray-400/0"
        }`}
      >
        <NeuDiv
          onClick={(e) => e.stopPropagation()}
          className={`model-main min-w-100 min-h-50 ${
            !show ? "scale-99 opacity-0" : "scale-100 opacity-100"
          } transition-all duration-300 ease-in-out`}
        >
          <div className="modal-title-bar flex items-center justify-between mb-3 px-1">
            <div className="text-lg font-medium">{title || "123"}</div>
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
          {children}
        </NeuDiv>
      </div>,
      document.body
    );
  }
  return null;
};

export default Model;
