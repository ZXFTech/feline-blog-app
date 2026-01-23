"use client";

import FlipClock from "@/components/Clock/FlipClock";
import Content from "@/components/Content";

export default function Home() {
  return (
    <Content>
      <div className="flex flex-col items-center justify-center h-full ">
        <FlipClock />
      </div>
    </Content>
  );
}
