import Content from "@/components/Content";
import { TagTodo } from "@/types/todo";
import { getTodoList } from "@/db/todoAction";
import TodoList from "./TodoList";

const Todos = async ({ searchParams }) => {
  const { orderBy, finished, content } = await searchParams;
  const isFinished = finished ? (finished === "true" ? true : false) : null;

  const {
    todoList,
    total,
    finished: finishedTodos,
  } = await getTodoList({ orderBy, finished: isFinished, content });

  const sortedList = {} as { [key: string]: TagTodo[] };
  (todoList || []).forEach((todo) => {
    const date = new Date(todo.createAt!);
    const dateKey = [
      date.getUTCFullYear(),
      (date.getUTCMonth() + 1).toString().padStart(2, "0"),
      (date.getUTCDate() + 1).toString().padStart(2, "0"),
    ].join("-");
    const tagTodo = {
      ...todo,
      tags: todo.tags.map((item) => item.tag),
    };
    if (sortedList[dateKey]) {
      sortedList[dateKey].push(tagTodo);
    } else {
      sortedList[dateKey] = [tagTodo];
    }
  });

  return <TodoList todoList={sortedList} />;
};

export default Todos;
