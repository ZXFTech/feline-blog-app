export type CombinedBlog = {
  author?: {
    password: string;
    createdAt: Date;
    id: string;
    email: string;
    phone: string | null;
    username: string;
    avatar: string | null;
    work: string | null;
    role: Role;
    updateAt: Date;
  };
  tags?: TagData[];
} & {
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  delete: boolean;
  id: number;
  authorId: string;
};
