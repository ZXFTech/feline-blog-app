"use client";

import { useLayoutEffect, useRef } from "react";
import NeuDiv from "../NeuDiv";

interface Props {
  value: string;
  countdown: boolean;
}

export default function FlipDigit({ value, countdown }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(value);

  let prevNum;
  if (countdown) {
    // 倒计时
    prevNum = Number(value) === 9 ? 0 : Number(value) + 1;
  } else {
    prevNum = Number(value) === 0 ? 9 : Number(value) - 1;
  }

  useLayoutEffect(() => {
    if (prev.current !== value && ref.current) {
      ref.current.classList.remove("flip");
      void ref.current.offsetWidth; // 强制重绘
      ref.current.classList.add("flip");
      prev.current = value;
    }
  }, [value]);

  return (
    <NeuDiv className="flip-digit border-none" ref={ref}>
      <div className="bg-bg font-mono! border-border border-[1px] rounded-tr-lg rounded-tl-lg box-border top">
        {prevNum}
      </div>
      <div className="bg-bg font-mono! border-border border-[1px] rounded-tr-lg rounded-tl-lg box-border top-back">
        {value}
      </div>
      <div className="bg-bg font-mono! border-border border-[1px] rounded-br-lg rounded-bl-lg box-border bottom">
        {value}
      </div>
      <div className="bg-bg font-mono! border-border border-[1px] rounded-br-lg rounded-bl-lg box-border bottom-back">
        {prevNum}
      </div>
    </NeuDiv>
  );
}
