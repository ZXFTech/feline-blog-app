import React from "react";

export const TextGap = ({ text, gap = 1 }: { text: string; gap?: number }) => {
  return (
    <div className={`inline-flex gap-${gap}`}>
      {text.split("").map((item: string, index) => (
        <span key={item + index}>{item}</span>
      ))}
    </div>
  );
};
