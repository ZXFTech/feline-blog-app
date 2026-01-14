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
    <div className="flex flex-col item-start gap-4 mb-3">
      <Tag>{new Date(dateKey).toLocaleDateString("zh-CN")}</Tag>
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
    </div>
  );
};

export default TodoDatePart;
