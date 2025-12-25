"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";
import NeuButton from "../NeuButton/neuButton";
import dynamic from "next/dynamic";
import { toast as message } from "../ProMessage";
import NeuInput from "../NeuInput";
import { Todo, Tag } from "../../../generated/prisma/client";
import Icon from "../Icon/icon";
import TagEditor from "../TagEditor";
import { TagTodo } from "@/types/todo";

const Modal = dynamic(() => import("@/components/Modal"), { ssr: false });

interface EditorProps {
  visible: boolean;
  refresh: () => void;
  todo?: TagTodo;
  onOk?: CallableFunction;
  onClose?: CallableFunction;
}

const TodoEditorBar = ({ visible, todo, onOk, onClose }: EditorProps) => {
  const [loading, setLoading] = useState(false);
  const [validateMessage, setValidateMessage] = useState("");

  const [todoData, setTodoData] = useState<TagTodo>({
    content: "",
    finished: false,
  });

  useEffect(() => {
    setTodoData((prev) => {
      return {
        ...todo,
        id: todo?.id || "",
        content: todo?.content || "",
        finished: todo?.finished || false,
        tags: todo?.tags?.map((item) => item.tag),
      };
    });
  }, [todo]);

  const onDataChange = (key: keyof TagTodo, value: TagTodo[keyof TagTodo]) => {
    setTodoData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleClose = () => {
    setTodoData({
      content: "",
      finished: false,
    });
    if (onClose) {
      onClose();
    }
  };

  const handleTodo = async () => {
    setLoading(true);

    const res = await fetch("/api/todo", {
      method: todoData.id ? "PATCH" : "POST",
      body: JSON.stringify(todoData),
    });

    const result = await res.json();
    setLoading(false);
    if (result.error) {
      message.error(result.message);
      return;
    }
    message.success("添加成功!");
  };

  const handleOk = async () => {
    if (!todoData.content?.trim()) {
      setValidateMessage("待办内容不能为空!");
      return;
    }
    if (validateMessage) setValidateMessage("");
    await handleTodo();
    setTodoData({
      content: "",
      finished: false,
    });
    if (onOk) {
      onOk();
    }
  };

  return (
    <Modal
      okLoading={loading}
      visible={visible}
      onClose={handleClose}
      onOk={handleOk}
    >
      <div>
        <NeuInput
          disabled={loading}
          className="w-full"
          value={todoData?.content || ""}
          autoComplete="off"
          onChange={(value) => onDataChange("content", value.target.value)}
        />
        {validateMessage && (
          <span className="text-red-500">{validateMessage}</span>
        )}
        <TagEditor
          value={todoData.tags || []}
          setValue={(tags) => onDataChange("tags", tags)}
        />
      </div>
    </Modal>
  );
};

export default TodoEditorBar;
