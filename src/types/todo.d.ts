import { TagData } from "@/components/TagEditor/index.jsx";

export type TagTodo = {
  id?: number;
  content: string;
  userId?: string;
  finished: boolean;
  createAt?: Date;
  updateAt?: Date;
  finishedAt?: Date;
  delete?: boolean;
  tags?: TagData[];
};

export interface TodoSearchParams {
  content?: string | null;
  orderBy?: "desc" | "asc";
  finished?: boolean | null;
  tags?: string | null;
}
