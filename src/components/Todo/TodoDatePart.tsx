"use client";

import { TagTodo } from "@/types/todo";
import Icon from "../Icon";
import NeuButton from "../NeuButton";
import NeuDiv from "../NeuDiv";
import Tag from "../Tag";

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
          <div key={todo.id} className="flex items-start justify-center gap-2">
            <NeuDiv
              style={{ fontSize: "20px" }}
              className="p-1! m-0! leading-0"
            >
              {todo.finished ? (
                <Icon
                  className="text-green-700"
                  size="xl"
                  icon="select_check_box"
                />
              ) : (
                <Icon size="xl" className="" icon="check_box_outline_blank" />
              )}
            </NeuDiv>
            <NeuButton
              onClick={() => handleClick(todo)}
              className={`m-0! w-full overflow-hidden! p-3! block! text-start`}
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
                  {todo.tags.map((item, index) => {
                    const tag = item.tag;
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
                onClick={() => handleUpdate(todo)}
              ></NeuButton>
              <NeuButton
                className="p-2!"
                icon="delete"
                onClick={() => handleDelete(todo.id!)}
              ></NeuButton>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TodoDatePart;
