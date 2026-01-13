"use client";

import classNames from "classnames";
import React, { useEffect, useRef, useState } from "react";
import NeuButton from "../NeuButton";
import logger from "@/lib/logger/Logger";

export interface CopyButtonPros {
  code: string;
}

function CopyButton({ code }: CopyButtonPros) {
  const [copyState, setCopyState] = useState<boolean>(false);
  const [lastClick, setLastClick] = useState<number>(0);

  const timer = useRef<NodeJS.Timeout | null>(null);
  const clickToCopy = async () => {
    try {
      setLastClick(Date.now());
      await navigator.clipboard.writeText(code);
      setCopyState(true);
    } catch (error) {
      logger.error("Copy error: " + error);
    }
  };

  useEffect(() => {
    timer.current = setTimeout(() => {
      if (Date.now() - lastClick > 1000) {
        setCopyState(false);
      }
    }, 1000);
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [copyState, lastClick]);

  const btnClassName = classNames("blog-code-copy", {
    "!text-green-500": copyState,
  });

  return (
    <NeuButton
      icon={copyState ? "check" : "file_copy"}
      className={`${btnClassName} p-1!`}
      onClick={() => clickToCopy()}
    ></NeuButton>
  );
}

export default CopyButton;
