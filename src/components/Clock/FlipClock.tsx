"use client";

import FlipDigit from "./FlipDigit";
import { useClock } from "@/hooks/useClock";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const weekDayMap: { [key: number]: string } = {
  0: "一",
  1: "二",
  2: "三",
  3: "四",
  4: "五",
  5: "六",
  6: "七",
};

export default function FlipClock() {
  const { time } = useClock();

  const [y1, y2, y3, y4] = pad(time.getFullYear()).split("");
  const [M1, M2] = pad(time.getMonth() + 1).split("");
  const [D1, D2] = pad(time.getDate()).split("");
  const [h1, h2] = pad(time.getHours()).split("");
  const [m1, m2] = pad(time.getMinutes()).split("");
  const [s1, s2] = pad(time.getSeconds()).split("");

  const weekDay = weekDayMap[time.getDay()];

  return (
    <div>
      <div className="flip-clock year-part">
        <div>{y1}</div>
        <div>{y2}</div>
        <div>{y3}</div>
        <div>{y4}</div>
        <span className="separator">-</span>
        <div>{M1}</div>
        <div>{M2}</div>
        <span className="separator">-</span>
        <div>{D1}</div>
        <div>{D2}</div>
        <span className="separator"> </span>
        <div>星期</div>
        <div>{weekDay}</div>
      </div>
      <div className="flip-clock">
        <FlipDigit value={h1} />
        <FlipDigit value={h2} />
        <span className="separator">:</span>
        <FlipDigit value={m1} />
        <FlipDigit value={m2} />
        <span className="separator">:</span>
        <FlipDigit value={s1} />
        <FlipDigit value={s2} />
      </div>
    </div>
  );
}
