"use client";

import { useClock } from "@/hooks/useClock";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

export default function Clock() {
  const { time } = useClock();
  const timeDay = dayjs(time);
  const year = Number(timeDay.format("YYYY"));
  const month = timeDay.format("MM");
  const date = timeDay.format("DD");
  const hour = timeDay.format("HH");
  const minute = timeDay.format("mm");
  const ss = timeDay.format("ss");

  let diffYears = year - 2020;
  let diffMonth = Number(month) - 4;
  let diffDays = Number(date) - 7;
  diffYears = diffMonth >= 0 ? diffYears : diffYears - 1;
  diffMonth = diffMonth >= 0 ? diffMonth : diffMonth + 12;
  diffMonth = diffDays >= 7 ? diffMonth : diffMonth - 1;
  diffDays = diffDays < 0 ? diffDays + 30 : diffDays;

  return (
    <>
      <div className="flex items-end text-4xl drop-shadow-lg">
        <div>{year}</div>
        <div>{month}</div>
        <div className="text-6xl">{date}</div>
        <div className="text-6xl">
          {hour}:{minute}:
        </div>
        <div>{ss}</div>
      </div>
      <div className="flex gap-1">
        <span>本站已运行:</span>
        <div>{diffYears}年</div>
        <div>{diffMonth}月</div>
        <div>{diffDays}日</div>
        <div>{hour}小时</div>
        <div>{minute}分钟</div>
        <div>{ss}秒</div>
      </div>
    </>
  );
}
