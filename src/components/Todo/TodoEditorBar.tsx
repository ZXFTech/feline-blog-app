"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { toast as message } from "../ProMessage";
import NeuInput from "../NeuInput";
import TagEditor, { TagData } from "../TagEditor";
import { TagTodo } from "@/types/todo";
import { addTodo, updateTodo } from "@/db/todoAction";
import { Tag } from "../../../generated/prisma/client";
import { useRouter } from "next/navigation";
import { getOptionTagsById } from "@/db/tagAction";
import classNames from "classnames";

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
  const [optionTags, setOptionTags] = useState<TagData[]>([]);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    getOptionTagsById("todo", todo?.id).then((tags) => setOptionTags(tags));
  }, [todo]);

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
      tags: todo?.tags,
    };
  }, [todo]);

  const resetStatus = useCallback(() => {
    setShake(false);
    setValidateMessage("");
    setTodoData(initialTodoData);
    setLoading(false);
  }, [setShake, setValidateMessage, setTodoData, setLoading, initialTodoData]);

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
    resetStatus();
    onClose?.();
  }, [onClose, resetStatus]);

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
      setShake(false);
      setLoading(false);
      router.refresh();
    }
  }, [todoData, router, todo]);

  const handleOk = async () => {
    if (!todoData.content?.trim()) {
      setValidateMessage("todo 内容不能为空");
      setShake(false);
      requestAnimationFrame(() => setShake(true));
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
      title="新增 Todo"
    >
      <div className="w-200">
        <div className=" mb-4">
          <NeuInput
            disabled={loading}
            className={classNames("w-full mb-1", {
              "input-shake": shake,
              "border-red-700!": validateMessage,
            })}
            value={todoData?.content || ""}
            autoComplete="off"
            onChange={(value) => {
              setValidateMessage("");
              onDataChange("content", value.target.value);
            }}
          />
          {validateMessage && (
            <span className="text-red-700 text-sm">{validateMessage}</span>
          )}
        </div>
        <TagEditor
          value={todoData.tags || []}
          setValue={(tags) => onDataChange("tags", tags)}
          options={optionTags}
        />
      </div>
    </Modal>
  );
};

export default TodoEditorBar;
