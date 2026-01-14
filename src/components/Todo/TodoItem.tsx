"use client";

import React from "react";
import Icon from "../Icon";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";
import Tag from "../Tag";
import { TagTodo } from "@/types/todo";

interface Props {
  todo: TagTodo;
  onTodoClick?: (todo: TagTodo) => void;
  onTodoUpdate?: (todo: TagTodo) => void;
  onTodoDelete?: (todoId: number) => void;
  editable?: boolean;
}

function TodoItem({
  todo,
  onTodoClick,
  onTodoDelete,
  onTodoUpdate,
  editable = true,
}: Props) {
  return (
    <div className="flex items-start justify-center gap-2">
      <NeuDiv style={{ fontSize: "20px" }} className="p-1! m-0! leading-0">
        {todo.finished ? (
          <Icon className="text-green-700" size="xl" icon="select_check_box" />
        ) : (
          <Icon size="xl" className="" icon="check_box_outline_blank" />
        )}
      </NeuDiv>
      <NeuButton
        onClick={() => editable && onTodoClick?.(todo)}
        className={`m-0! w-full overflow-hidden! p-3! block! text-start ${
          !editable && "cursor-not-allowed!"
        }`}
        disabled={!editable}
      >
        <span
          className={`${
            todo.finished ? "line-through" : ""
          } text-sm text-start whitespace-break-spaces font-semibold inline-block`}
        >
          {todo.content}
        </span>
        {todo.tags?.length ? (
          <div className="todo-tags flex flex-wrap gap-1 justify-end mt-2">
            {todo.tags.map((tag, index) => {
              return (
                <Tag key={tag.content + index} color={tag.color}>
                  {tag.content}
                </Tag>
              );
            })}
          </div>
        ) : null}
      </NeuButton>
      <div className="flex flex-col">
        <NeuButton
          className="p-2! mb-2"
          icon="edit"
          onClick={() => onTodoUpdate?.(todo)}
        ></NeuButton>
        <NeuButton
          className="p-2!"
          icon="delete"
          onClick={() => onTodoDelete?.(todo.id!)}
        ></NeuButton>
      </div>
    </div>
  );
}

export default TodoItem;
