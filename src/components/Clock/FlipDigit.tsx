"use client";

import { useLayoutEffect, useRef } from "react";
import NeuDiv from "../NeuDiv";

interface Props {
  value: string;
}

export default function FlipDigit({ value }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(value);

  const prevNum = Number(value) === 0 ? 9 : Number(value) - 1;

  useLayoutEffect(() => {
    if (prev.current !== value && ref.current) {
      ref.current.classList.remove("flip");
      void ref.current.offsetWidth; // 强制重绘
      ref.current.classList.add("flip");
      prev.current = value;
    }
  }, [value]);

  return (
    <NeuDiv className="flip-digit" ref={ref}>
      <div className="top">{prevNum}</div>
      <div className="top-back">{value}</div>
      <div className="bottom">{value}</div>
      <div className="bottom-back">{prevNum}</div>
    </NeuDiv>
  );
}
