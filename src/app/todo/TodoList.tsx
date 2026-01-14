"use client";
import { toast as message } from "@/components/ProMessage";
import TodoEditorBar from "@/components/Todo/TodoEditorBar";
import React, { useState } from "react";
import TodoDatePart from "@/components/Todo/TodoDatePart";
import { TodoOperationBar } from "@/components/Todo/TodoOperationBar";
import { TagTodo } from "@/types/todo";
import { deleteTodo, updateTodo } from "@/db/todoAction";
import { useRouter } from "next/navigation";

interface Props {
  todoList: { [key: string]: TagTodo[] };
}

function TodoList({ todoList }: Props) {
  const router = useRouter();

  // 编辑 todo 相关
  const [targetTodo, setTargetTodo] = useState<TagTodo | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  const updateTodoById = async (todo: TagTodo) => {
    try {
      if (!todo.id) {
        throw new Error("未找到 todo");
      }
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
      <div className="w-full px-2">
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
      <TodoEditorBar
        onOk={resetPanel}
        onClose={resetPanel}
        todo={targetTodo}
        visible={panelVisible}
      ></TodoEditorBar>
    </>
  );
}

export default TodoList;
