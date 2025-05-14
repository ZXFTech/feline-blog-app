"use client";

import Content from "@/components/Content/content";
import { message } from "@/lib/message";
import TodoEditorBar from "@/components/Todo/TodoEditorBar";
import { useEffect, useRef, useState } from "react";
import Loading from "../loading";
import { Todo } from "../../../generated/prisma";
import TodoDatePart from "@/components/Todo/TodoDatePart";

const fakeData: {
  id: number;
  content: string;
  finish: boolean;
  finishAt?: Date;
}[] = [
  {
    id: 0,
    content: "测试1",
    finish: false,
  },
  {
    id: 1,
    content: "测试2",
    finish: true,
    finishAt: new Date(),
  },
  {
    id: 2,
    content: "测试3",
    finish: true,
    finishAt: new Date(),
  },
  {
    id: 3,
    content: "测试4",
    finish: false,
  },
  {
    id: 4,
    content: "测试5",
    finish: true,
    finishAt: new Date(),
  },
  {
    id: 5,
    content: "测试6",
    finish: false,
  },
];

const TodoList = () => {
  const [todoList, setTodoList] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const [activeDate, setActiveDate] = useState(null);

  const dateSections = useRef(new Map());

  const getBlogList = async () => {
    const res = await fetch("/api/todo");
    const { data, error, message: errMessage } = await res.json();
    if (error) {
      return message.error(errMessage);
    }
    const todoList = data.todoList as Todo[];

    const sortedList = {} as any;
    (todoList || []).forEach((todo) => {
      const date = new Date(todo.createAt);
      const dateKey = [
        date.getUTCFullYear(),
        (date.getUTCMonth() + 1).toString().padStart(2, "0"),
        (date.getUTCDate() + 1).toString().padStart(2, "0"),
      ].join("-");
      sortedList[dateKey]
        ? sortedList[dateKey].push(todo)
        : (sortedList[dateKey] = [todo]);
    });
    setTodoList(sortedList);
  };

  useEffect(() => {
    getBlogList();
  }, []);

  // useEffect(() => {
  //   const observer = new IntersectionObserver(
  //     (entries) => {
  //       entries.forEach(entry => {
  //         const date = entry.target.
  //       })
  //     }
  //   )
  // })

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
      <div className="w-full p-3">
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
