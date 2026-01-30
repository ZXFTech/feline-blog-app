"use client";
import { toast as message } from "@/components/ProMessage";
import TodoEditorBar from "@/components/Todo/TodoEditorBar";
import React, { useState } from "react";
import TodoDatePart from "@/components/Todo/TodoDatePart";
import { TodoOperationBar } from "@/components/Todo/TodoOperationBar";
import { TagTodo } from "@/types/todo";
import { deleteTodo, updateTodo } from "@/db/todoAction";
import { useRouter } from "next/navigation";
import { useSoundManager } from "@/hooks/useSoundManager";

interface Props {
  todoList: { [key: string]: TagTodo[] };
}

function TodoList({ todoList }: Props) {
  const router = useRouter();

  const { unlock, play } = useSoundManager([
    {
      id: "notify",
      src: "/sounds/notify.mp3",
      preload: "auto",
      concurrency: "restart", // 连点时重启播放（提示音常用）
      cooldownMs: 80, // 80ms 内只响一次，避免疯狂连点刺耳
      volume: 1,
      iosUnlockHack: false, // 如遇 iOS 首次无声，可尝试 true
    },
  ]);

  // 编辑 todo 相关
  const [targetTodo, setTargetTodo] = useState<TagTodo | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  const updateTodoById = async (todo: TagTodo) => {
    try {
      if (!todo.id) {
        throw new Error("未找到 todo");
      }
      await unlock();
      await play("notify");
      await updateTodo({
        id: todo.id,
        finished: !todo.finished,
      });
    } catch (error) {
      message.error("更新失败" + error);
    } finally {
      router.refresh();
    }
  };

  const deleteTodoById = async (todoId: number) => {
    try {
      await deleteTodo(todoId);
    } catch (error) {
      message.error("删除失败." + error);
    } finally {
      router.refresh();
    }
  };

  const editTodo = (todo: TagTodo) => {
    setTargetTodo(todo);
    setPanelVisible(true);
  };

  const resetPanel = async () => {
    setPanelVisible(false);
    setTargetTodo(null);
  };

  return (
    <>
      <TodoOperationBar setPanelVisible={setPanelVisible} />
      <div className="flex flex-col item-start gap-4 mb-3 w-full px-2">
        {Object.keys(todoList).map((key) => {
          return (
            <TodoDatePart
              key={key}
              dateKey={key}
              todoList={todoList[key]}
              handleClick={updateTodoById}
              handleDelete={deleteTodoById}
              handleUpdate={editTodo}
            />
          );
        })}
      </div>
      {panelVisible ? (
        <TodoEditorBar
          onOk={resetPanel}
          onClose={resetPanel}
          todo={targetTodo}
          visible={panelVisible}
        ></TodoEditorBar>
      ) : null}
    </>
  );
}

export default TodoList;
