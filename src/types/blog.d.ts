export type CombinedBlog = {
  author?: {
    id: string;
    username: string;
    avatar: string | null;
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
  likeCount?: number;
  favoriteCount?: number;
};
