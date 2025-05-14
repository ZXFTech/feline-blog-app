"use client";

import { useEffect, useState } from "react";
import NeuButton from "../NeuButton/neuButton";
import dynamic from "next/dynamic";
import { message } from "@/lib/message";
import { useRouter } from "next/navigation";

const Model = dynamic(() => import("../Modal"), { ssr: false });

const TodoEditorBar = ({ refresh }: { refresh: () => void }) => {
  const router = useRouter();
  const [visible, setVisible] = useState<boolean>(false);

  const handleClose = () => {
    setVisible(false);
  };

  const data = {
    content:
      "测试todo everybody farmer society plastic motion thy noted market outline that brave cattle welcome silver trip mass becoming father prevent equator ago task fill coach",
  };

  // useEffect(() => {
  //   if (visible) {
  //     const timer = setTimeout(() => {
  //       setVisible(false);
  //     }, 1000);
  //     return () => clearTimeout(timer);
  //   }
  // }, [visible]);

  const addTodo = async () => {
    const res = await fetch("/api/todo", {
      method: "POST",
      body: JSON.stringify(data),
    });

    console.log("res", res);

    const result = await res.json();
    if (result.error) {
      message.error(result.message);
    }
    refresh();
    // router.replace("/todo");
  };

  const handleOk = () => {
    setVisible(false);
  };
  const handleCreateNew = () => {};
  return (
    <div>
      <NeuButton onClick={() => addTodo()}>添加</NeuButton>
      <Model visible={visible} onClose={handleClose} onOk={handleOk}>
        <NeuButton>测试</NeuButton>
        <NeuButton>测试</NeuButton>
        <NeuButton>测试</NeuButton>
        <NeuButton>测试</NeuButton>
      </Model>
      {/* <TestModal visible={visible} onClose={handleClose}>
        <NeuButton>测试</NeuButton>
        <NeuButton>测试</NeuButton>
        <NeuButton>测试</NeuButton>
        <NeuButton>测试</NeuButton>
      </TestModal> */}
    </div>
  );
};

export default TodoEditorBar;
