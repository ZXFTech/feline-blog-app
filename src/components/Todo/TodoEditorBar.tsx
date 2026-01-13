"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast as message } from "../ProMessage";
import NeuInput from "../NeuInput";
import TagEditor from "../TagEditor";
import { TagTodo } from "@/types/todo";
import { addTodo, updateTodo } from "@/db/todoAction";
import { Tag } from "../../../generated/prisma/client";
import { useRouter } from "next/navigation";

const Modal = dynamic(() => import("@/components/Modal"), { ssr: false });

interface EditorProps {
  visible: boolean;
  todo: TagTodo | null;
  onOk?: () => void;
  onClose?: () => void;
}

const INITIAL_TODO_DATA: TagTodo = {
  content: "",
  finished: false,
};

const TodoEditorBar = ({ visible, todo, onOk, onClose }: EditorProps) => {
  const router = useRouter();
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
  }, [onClose]);

  const handleTodo = useCallback(async () => {
    setLoading(true);
    try {
      if (todo) {
        if (!todo?.id) {
          throw new Error("未找到 todo");
        }
        await updateTodo({
          id: todo.id,
          content: todoData.content,
          tags: todoData.tags as Tag[],
        });
      } else {
        await addTodo({ content: todoData.content, tags: todoData.tags });
      }
      message.success("添加成功!");
    } catch (error) {
      message.error("添加失败," + error);
    } finally {
      setLoading(false);
      router.refresh();
    }
  }, [todoData, router, todo]);

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
          className="w-full mb-4"
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
