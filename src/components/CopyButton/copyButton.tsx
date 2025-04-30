"use client";

import classNames from "classnames";
import React, { useEffect, useState } from "react";
import NeuButton from "../NeuButton/neuButton";

export interface CopyButtonPros {
  code: string;
}

function CopyButton({ code }: CopyButtonPros) {
  const [copyState, setCopyState] = useState<boolean>(false);
  const [lastClick, setLastClick] = useState<number>(0);

  let timer: NodeJS.Timeout | undefined = undefined;
  const clickToCopy = async () => {
    try {
      setLastClick(Date.now());
      await navigator.clipboard.writeText(code);
      setCopyState(true);
    } catch (error) {
      console.log("copy error:", error);
    }
  };

  useEffect(() => {
    timer = setTimeout(() => {
      if (Date.now() - lastClick > 1000) {
        setCopyState(false);
      }
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [copyState, lastClick]);

  const btnClassName = classNames("blog-code-copy", {
    "!text-green-500": copyState,
  });

  return (
    <NeuButton
      icon={copyState ? "check" : "file_copy"}
      className={`${btnClassName}`}
      onClick={() => clickToCopy()}
    ></NeuButton>
  );
}

export default CopyButton;
