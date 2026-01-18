import { SidebarComp } from "@/app/pathMeta";
import classNames from "classnames";
import { FC, HTMLAttributes } from "react";
import Sidebar from "../Sidebar/Sidebar";

interface ContentProps extends HTMLAttributes<HTMLDivElement> {
  leftSideBar?: SidebarComp[];
  rightSideBar?: SidebarComp[];
}

const Content: FC<ContentProps> = ({
  leftSideBar,
  rightSideBar,
  children,
  className,
  ...restProps
}) => {
  return (
    <div
      {...restProps}
      className={classNames(
        "content-container relative flex justify-center gap-8 hide-scrollbar"
      )}
    >
      {leftSideBar?.length ? (
        <div className="left-side-bar hide-scrollbar  pt-22">
          <Sidebar compList={leftSideBar} />
        </div>
      ) : null}
      <div
        className={classNames(
          "content h-[100vh] pb-14 relative overflow-scroll hide-scrollbar pt-22",
          className
        )}
      >
        {children}
      </div>
      {rightSideBar?.length ? (
        <div className="right-side-bar hide-scrollbar pt-22">
          <Sidebar compList={rightSideBar} />
        </div>
      ) : null}
    </div>
  );
};

export default Content;
