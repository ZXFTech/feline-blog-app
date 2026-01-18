import { SidebarComp } from "@/app/pathMeta";
import React, { ComponentType, ReactNode } from "react";
import { ProfileCard } from "../Profile/ProfileCard";

const Calendar = () => {
  return <div>日历</div>;
};

const BlogOperationBar = () => {
  return <div>Blog Operation Bar</div>;
};

const TodoConclusion = () => {
  return <div>Todo Conclusion</div>;
};

type SidebarMap = Record<SidebarComp, ComponentType>;
const sidebarComponentMap: SidebarMap = {
  profile: ProfileCard,
  calendar: Calendar,
  blogOperationBar: BlogOperationBar,
  todoConclusion: TodoConclusion,
};

function Sidebar({ compList }: { compList: SidebarComp[] }) {
  return (
    <>
      {compList.map((item) => {
        const Comp = sidebarComponentMap[item];
        return <Comp key={item} />;
      })}
    </>
  );
}

export default Sidebar;
