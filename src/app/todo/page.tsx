"use client";

import Content from "@/components/Content/content";
import { message } from "@/lib/message";
import TodoEditorBar from "@/components/Todo/TodoEditorBar";
import { useCallback, useEffect, useState } from "react";
import TodoDatePart from "@/components/Todo/TodoDatePart";
import { TagTodo } from "@/types/todo";
import NeuButton from "@/components/NeuButton/neuButton";
import { useSearchParams } from "next/navigation";
import { TodoOperationBar } from "@/components/Todo/TodoOperationBar";
import NeuDiv from "@/components/NeuDiv/NeuDiv";

const TodoList = () => {
  const [todoList, setTodoList] = useState<{ [key: string]: TagTodo[] }>({});
  const [loading, setLoading] = useState(false);

  const searchParams = useSearchParams().toString();

  // 编辑 todo 相关
  const [targetTodo, setTargetTodo] = useState<TagTodo>({
    content: "",
    finished: false,
  });
  const [panelVisible, setPanelVisible] = useState(false);

  const getTodoList = useCallback(async () => {
    const res = await fetch(`/api/todo?${searchParams}`);
    const { data, error, message: errMessage } = await res.json();
    if (error) {
      return message.error(errMessage);
    }
    const todoList = data.todoList as TagTodo[];

    const sortedList = {} as { [key: string]: TagTodo[] };
    (todoList || []).forEach((todo) => {
      const date = new Date(todo.createAt!);
      const dateKey = [
        date.getUTCFullYear(),
        (date.getUTCMonth() + 1).toString().padStart(2, "0"),
        (date.getUTCDate() + 1).toString().padStart(2, "0"),
      ].join("-");
      if (sortedList[dateKey]) {
        sortedList[dateKey].push(todo);
      } else {
        sortedList[dateKey] = [todo];
      }
    });
    setTodoList(sortedList);
  }, [searchParams]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    getTodoList();
  }, [getTodoList]);

  const updateTodoById = async (todo: TagTodo) => {
    const res = await fetch("/api/todo", {
      method: "PATCH",
      body: JSON.stringify({ id: todo.id, finished: !todo.finished }),
    });

    const result = await res.json();

    if (result.error) {
      message.error(result.message);
    } else {
      message.success("更新成功!");
      await getTodoList();
    }
  };

  const deleteTodoById = async (todoId: number) => {
    const res = await fetch("/api/todo", {
      method: "DELETE",
      body: JSON.stringify({ todoId }),
    });
    const result = await res.json();
    if (result.error) {
      message.error(result.message);
      return;
    }
    message.success("已删除.");
    await getTodoList();
  };

  const editTodo = (todo: TagTodo) => {
    setTargetTodo(todo);
    setPanelVisible(true);
  };

  const resetPanel = async () => {
    setPanelVisible(false);
    setTargetTodo({
      content: "",
      finished: false,
    });
    await getTodoList();
  };

  return (
    <>
      <Content
        rightSideBar={
          <NeuDiv neuType="flat">
            <NeuButton className="p-1!" onClick={() => setPanelVisible(true)}>
              新建
            </NeuButton>
          </NeuDiv>
        }
      >
        <TodoOperationBar
          setPanelVisible={setPanelVisible}
          refresh={getTodoList}
        />
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
      </Content>
      <TodoEditorBar
        onOk={resetPanel}
        onClose={resetPanel}
        refresh={getTodoList}
        todo={targetTodo}
        visible={panelVisible}
      ></TodoEditorBar>
    </>
  );
};

export default TodoList;
