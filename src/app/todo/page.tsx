"use client";

import Content from "@/components/Content/content";
import { message } from "@/lib/message";
import TodoEditorBar from "@/components/Todo/TodoEditorBar";
import { useEffect, useState } from "react";
import { Todo } from "../../../generated/prisma";
import TodoDatePart from "@/components/Todo/TodoDatePart";

const TodoList = () => {
  const [todoList, setTodoList] = useState<{ [key: string]: Todo[] }>({});

  const getBlogList = async () => {
    const res = await fetch("/api/todo");
    const { data, error, message: errMessage } = await res.json();
    if (error) {
      return message.error(errMessage);
    }
    const todoList = data.todoList as Todo[];

    const sortedList = {} as { [key: string]: Todo[] };
    (todoList || []).forEach((todo) => {
      const date = new Date(todo.createAt);
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
  };

  useEffect(() => {
    getBlogList();
  }, []);

  const updateTodoById = async (todo: Todo) => {
    const res = await fetch("/api/todo", {
      method: "PATCH",
      body: JSON.stringify({ todoId: todo.id, finished: !todo.finished }),
    });

    const result = await res.json();

    if (result.error) {
      message.error(result.message);
    } else {
      message.success("更新成功!");
      await getBlogList();
    }
  };

  return (
    <Content rightSideBar={<TodoEditorBar refresh={getBlogList} />}>
      <div className="w-full px-2">
        {Object.keys(todoList).map((key) => {
          return (
            <TodoDatePart
              key={key}
              dateKey={key}
              todoList={todoList[key]}
              handleClick={updateTodoById}
            />
          );
        })}
      </div>
    </Content>
  );
};

export default TodoList;
