import db from "./client";
import { Tag } from "../../generated/prisma";

interface Relation {
  blogId?: number;
  todoId?: number;
  userId?: number;
}

type TagData = Omit<Tag, "createdAt" | "updatedAt" | "userId">;
export const addNewTag = async (data: TagData[], relation: Relation) => {
  const res = await db.tag.createMany({});
};
