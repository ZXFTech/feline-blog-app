"use client";

import { TagTodo } from "@/types/todo";
import Tag from "../Tag";
import TodoItem from "./TodoItem";

interface Props {
  dateKey: string;
  todoList: TagTodo[];
  handleClick: (todo: TagTodo) => void;
  handleDelete: (todoId: number) => void;
  handleUpdate: (todo: TagTodo) => void;
}

const TodoDatePart = ({
  todoList,
  dateKey,
  handleClick,
  handleDelete,
  handleUpdate,
}: Props) => {
  return (
    <>
      <Tag className="mb-0! sticky top-17 bg-bg! z-10">
        {new Date(dateKey).toLocaleDateString("zh-CN")}
      </Tag>
      {todoList.map((todo) => {
        return (
          <TodoItem
            key={todo.id}
            todo={todo}
            onTodoClick={handleClick}
            onTodoDelete={handleDelete}
            onTodoUpdate={handleUpdate}
          />
        );
      })}
    </>
  );
};

export default TodoDatePart;
