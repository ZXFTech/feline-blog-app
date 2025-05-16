"use client";

import { useEffect, useState } from "react";
import NeuButton from "../NeuButton/neuButton";
import dynamic from "next/dynamic";
import { message } from "@/lib/message";
import { useRouter } from "next/navigation";
import NeuInput from "../NeuInput";
import { Todo } from "../../../generated/prisma";
import Icon from "../Icon/icon";

const Model = dynamic(() => import("../Modal"), { ssr: false });

const TodoEditorBar = ({ refresh }: { refresh: () => void }) => {
  const [visible, setVisible] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [validateMessage, setValidateMessage] = useState("");

  const [todoData, setTodoData] = useState<Partial<Todo>>({
    content: "",
    finished: false,
  });

  const onDataChange = (key: string, value: string) => {
    setTodoData({
      ...todoData,
      [key]: value,
    });
  };

  const handleClose = () => {
    setVisible(false);
  };

  const addTodo = async () => {
    setLoading(true);
    const res = await fetch("/api/todo", {
      method: "POST",
      body: JSON.stringify(todoData),
    });

    const result = await res.json();
    setLoading(false);
    if (result.error) {
      message.error(result.message);
      return;
    }
    message.success("添加成功!");
    setVisible(false);
    refresh();
  };

  const handleOk = async () => {
    if (!todoData.content?.trim()) {
      setValidateMessage("待办内容不能为空!");
      return;
    }
    validateMessage && setValidateMessage("");
    await addTodo();
  };
  return (
    <div>
      <NeuButton className="p-1!" onClick={() => setVisible(true)}>
        <Icon icon="note_add" size="3xl" />
      </NeuButton>
      <Model
        okLoading={loading}
        visible={visible}
        onClose={handleClose}
        onOk={handleOk}
      >
        <NeuInput
          disabled={loading}
          className="w-full"
          value={todoData.content}
          onChange={(value: any) => onDataChange("content", value.target.value)}
        />
        {validateMessage && (
          <span className="text-red-500">{validateMessage}</span>
        )}
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
