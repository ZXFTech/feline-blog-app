"use client";

import { Todo } from "../../../generated/prisma/client";
import Icon from "../Icon/icon";
import NeuButton from "../NeuButton/neuButton";
import NeuDiv from "../NeuDiv/NeuDiv";
import Tag from "../Tag/tag";
interface Props {
  dateKey: string;
  todoList: Todo[];
  handleClick: (todo: Todo) => void;
}

const TodoDatePart = ({ todoList, dateKey, handleClick }: Props) => {
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
                <Icon className="text-green-700" icon="select_check_box" />
              ) : (
                <Icon className="" icon="check_box_outline_blank" />
              )}
            </NeuDiv>
            <NeuButton
              onClick={() => handleClick(todo)}
              className={`my-0! w-full overflow-hidden! word-wrap ${
                todo.finished ? "line-through" : ""
              }`}
            >
              {todo.content}
            </NeuButton>
          </div>
        );
      })}
    </div>
  );
};

export default TodoDatePart;
