import Content from "@/components/Content";
import React from "react";
import { TomatoTimer } from "./tomato-timer";
import { addTomatoHistory } from "@/db/tomatoActions";

function Tomato() {
  return (
    <Content>
      <TomatoTimer></TomatoTimer>
    </Content>
  );
}

export default Tomato;
