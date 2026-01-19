"use client";

import FlipDigit from "./FlipDigit";
import { useClock } from "@/hooks/useClock";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function FlipClock() {
  const { time } = useClock();

  const [y1, y2, y3, y4] = pad(time.getFullYear()).split("");
  const [M1, M2] = pad(time.getMonth() + 1).split("");
  const [D1, D2] = pad(time.getDate()).split("");
  const [h1, h2] = pad(time.getHours()).split("");
  const [m1, m2] = pad(time.getMinutes()).split("");
  const [s1, s2] = pad(time.getSeconds()).split("");

  console.log("m1", M2);

  return (
    <div className="flip-clock">
      <FlipDigit value={y1} />
      <FlipDigit value={y2} />
      <FlipDigit value={y3} />
      <FlipDigit value={y4} />
      <span className="separator">-</span>
      <FlipDigit value={M1} />
      <FlipDigit value={M2} />
      <span className="separator">-</span>
      <FlipDigit value={D1} />
      <FlipDigit value={D2} />
      <span className="separator"> </span>
      <FlipDigit value={h1} />
      <FlipDigit value={h2} />
      <span className="separator">:</span>
      <FlipDigit value={m1} />
      <FlipDigit value={m2} />
      <span className="separator">:</span>
      <FlipDigit value={s1} />
      <FlipDigit value={s2} />
    </div>
  );
}
