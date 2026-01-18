export type SidebarComp =
  | "profile"
  | "calendar"
  | "blogOperationBar"
  | "todoConclusion";

interface PathMeta {
  path: string;
  meta: {
    left?: SidebarComp[];
    right?: SidebarComp[];
  };
}

export const pathMeta: PathMeta[] = [
  {
    path: "/",
    meta: {
      right: ["calendar"],
    },
  },
  {
    path: "/blog",
    meta: {
      right: ["blogOperationBar"],
    },
  },
  {
    path: "/todo",
    meta: {
      right: ["todoConclusion"],
    },
  },
];
