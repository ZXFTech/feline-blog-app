"use client";

import NeuButton from "@/components/NeuButton";
import TagEditor, { TagData } from "@/components/TagEditor";
import TodoItem from "@/components/Todo/TodoItem";
import { updateTodo } from "@/db/todoAction";
import logger from "@/lib/logger/Logger";
import { TagTodo } from "@/types/todo";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

interface Props {
  todo: TagTodo;
  initialTags: TagData[];
  valuableTags: TagData[];
}

function ClientPart({ todo, initialTags, valuableTags }: Props) {
  const router = useRouter();
  const [tags, setTags] = useState<TagData[]>(initialTags);

  useEffect(() => {
    setTags(initialTags);
  }, [initialTags]);

  const handleChange = (value: TagData[]) => {
    setTags(value);
  };

  const submitTodo = async () => {
    try {
      const newTodo = {
        id: todo.id!,
        tags: tags,
      };

      if (!newTodo.id) {
        return;
      }

      await updateTodo({
        id: newTodo.id,
        tags: newTodo.tags,
      });
      router.refresh();
    } catch (error) {
      logger.error(error);
    }
  };
  return (
    <div className="p-4">
      <div className="mb-4">
        <TodoItem todo={todo} />
      </div>
      <TagEditor value={tags} options={valuableTags} setValue={handleChange} />
      <div>
        <NeuButton onClick={submitTodo}>提交</NeuButton>
      </div>
    </div>
  );
}

export default ClientPart;
