"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast as message } from "../ProMessage";
import NeuInput from "../NeuInput";
import TagEditor from "../TagEditor";
import { TagTodo } from "@/types/todo";

const Modal = dynamic(() => import("@/components/Modal"), { ssr: false });

interface EditorProps {
  visible: boolean;
  refresh: () => void;
  todo?: TagTodo;
  onOk?: () => void;
  onClose?: () => void;
}

const INITIAL_TODO_DATA: TagTodo = {
  content: "",
  finished: false,
};

const TodoEditorBar = ({ visible, todo, onOk, onClose }: EditorProps) => {
  const [loading, setLoading] = useState(false);
  const [validateMessage, setValidateMessage] = useState("");

  const [todoData, setTodoData] = useState<TagTodo>({
    content: "",
    finished: false,
  });

  const initialTodoData = useMemo(() => {
    if (!todo) {
      return INITIAL_TODO_DATA;
    }
    return {
      ...todo,
      id: todo?.id,
      content: todo?.content || "",
      finished: todo?.finished || false,
      tags: todo?.tags?.map((item) => item.tag),
    };
  }, [todo]);

  useEffect(() => {
    setTodoData(initialTodoData);
  }, [initialTodoData]);

  const onDataChange = useCallback(
    (key: keyof TagTodo, value: TagTodo[keyof TagTodo]) => {
      setTodoData((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const handleClose = useCallback(() => {
    setTodoData(INITIAL_TODO_DATA);
    if (onClose) {
      onClose();
    }
  }, []);

  const handleTodo = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/todo", {
        method: todoData.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(todoData),
      });

      const result = await res.json();
      if (result.error) {
        message.error(result.message);
        return;
      }
      message.success("添加成功!");
    } catch (error) {
      console.error("操作失败:", error);
      message.error("操作失败,请重试");
    } finally {
      setLoading(false);
    }
  }, [todoData]);

  const handleOk = async () => {
    if (!todoData.content?.trim()) {
      setValidateMessage("待办内容不能为空!");
      return;
    }
    if (validateMessage) setValidateMessage("");

    await handleTodo();

    setTodoData(INITIAL_TODO_DATA);
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
