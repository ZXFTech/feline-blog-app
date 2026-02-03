import Content from "@/components/Content";
import { Pomodoro } from "@/components/pomodoro";
import History from "@/components/pomodoro/PomodoroList";
import { getTomatoHistory } from "@/db/tomatoActions";
import React from "react";

async function Tomato() {
  const dataSource = await getTomatoHistory({});

  return (
    <Content rightSideBar={<History dataSource={dataSource} />}>
      <Pomodoro />
    </Content>
  );
}

export default Tomato;
