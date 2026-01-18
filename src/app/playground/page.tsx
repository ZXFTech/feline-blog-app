import Content from "@/components/Content";
import db from "@/db/client";
import { getTodoById } from "@/db/todoAction";
import { ProfileCard } from "@/components/Profile/ProfileCard";

export default async function Playground() {
  const todoId = 49;
  const todo = await getTodoById(todoId, "", true);

  if (!todo) {
    return <Content>todo 不存在</Content>;
  }

  const initialTags = todo.tags;

  const valuableTags = await db.tag.findMany({
    where: {
      todos: {
        none: {
          todoId: todoId,
        },
      },
    },
    orderBy: {
      todos: {
        _count: "desc",
      },
    },
  });

  return (
    <>
      {/* <ClientPart
        todo={todo}
        initialTags={initialTags}
        valuableTags={valuableTags}
      /> */}
      <ProfileCard />
    </>
  );
}
