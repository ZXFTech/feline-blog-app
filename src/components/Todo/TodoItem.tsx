"use client";

import React from "react";
import Icon from "../Icon";
import { Button } from "@/components/ui/button";
import { NeuSurface } from "@/components/ui/neu-surface";
import Tag from "../Tag";
import { TagTodo } from "@/types/todo";

interface Props {
  todo: TagTodo;
  onTodoClick?: (todo: TagTodo) => void;
  onTodoUpdate?: (todo: TagTodo) => void;
  onTodoDelete?: (todoId: number) => void;
  editable?: boolean;
}

function TodoItem({ todo, onTodoClick, onTodoDelete, onTodoUpdate, editable = true }: Props) {
  return (
    <div className="flex items-start justify-center gap-2">
      <NeuSurface className="m-0! border border-border p-1! leading-0">
        {todo.finished ? (
          <Icon className="text-green-700" size="xl" icon="select_check_box" />
        ) : (
          <Icon size="xl" icon="check_box_outline_blank" />
        )}
      </NeuSurface>
      <Button
        onClick={() => editable && onTodoClick?.(todo)}
        className={`m-0! block! h-auto! min-w-0 flex-1 overflow-hidden! bg-background p-3! text-start text-foreground shadow-neu-raised ${
          !editable && "cursor-not-allowed!"
        }`}
        disabled={!editable}
      >
        <span className="inline-flex min-w-0 items-center justify-start gap-2 whitespace-nowrap text-center">
          <span
            className={`${
              todo.finished ? "line-through" : ""
            } inline-block whitespace-break-spaces text-start text-sm font-semibold`}
          >
            {todo.content}
          </span>
          {todo.tags?.length ? (
            <span className="todo-tags inline-flex flex-wrap justify-end gap-1">
              {todo.tags.map((tag, index) => {
                return (
                  <Tag key={tag.content + index} color={tag.color}>
                    {tag.content}
                  </Tag>
                );
              })}
            </span>
          ) : null}
        </span>
      </Button>
      <div className="flex flex-col">
        <Button
          className="m-1! mb-2! h-auto! bg-background p-2! text-foreground shadow-neu-raised"
          materialIcon="edit"
          onClick={() => onTodoUpdate?.(todo)}
        ></Button>
        <Button
          className="m-1! h-auto! bg-background p-2! text-foreground shadow-neu-raised"
          materialIcon="delete"
          onClick={() => onTodoDelete?.(todo.id!)}
        ></Button>
      </div>
    </div>
  );
}

export default TodoItem;
