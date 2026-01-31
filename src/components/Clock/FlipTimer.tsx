"use client";

import FlipDigit from "./FlipDigit";

export default function FlipTimer({ time }: { time: string }) {
  // const [h1, h2] = pad(time.getHours()).split("");
  // const [m1, m2] = pad(time.getMinutes()).split("");
  // const [s1, s2] = pad(time.getSeconds()).split("");

  const [[m1, m2], [s1, s2]] = time.split(":").map((t) => t.split(""));

  return (
    <div className="text-font">
      <div className="flip-clock">
        <FlipDigit value={m1} countdown />
        <FlipDigit value={m2} countdown />
        <span className="separator">:</span>
        <FlipDigit value={s1} countdown />
        <FlipDigit value={s2} countdown />
      </div>
    </div>
  );
}
