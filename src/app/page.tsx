"use client";

import Clock from "@/components/Clock";
import FlipClock from "@/components/Clock/FlipClock";
import Content from "@/components/Content";
import { getToday } from "@/lib/context/today";
import dayjs from "dayjs";

export default function Home() {
  return (
    <Content>
      <div className="flex flex-col items-center justify-center h-full ">
        {/* <div className="flex flex-col items-start justify-start text-[16px]  absolute top-22 left-0">
        <span style={{ color: "#333" }}>欢迎你，远方的朋友。</span>
        <span style={{ color: "#333" }}>虽千山万水之外，却此时此地相遇。</span>
        <span style={{ color: "#333" }}>市井喧阗，车马填咽。</span>
        <span style={{ color: "#333" }}>愿你</span>
      </div>
      <span className="font-ma-shan-zheng text-3xl text-black">
        初心如磐，行稳致远；所行皆顺，所愿皆成。
      </span> */}
        <FlipClock />
      </div>
    </Content>
  );
}
