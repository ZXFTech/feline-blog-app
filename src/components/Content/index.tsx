import classNames from "classnames";
import React, { FC, HTMLAttributes, ReactNode } from "react";

interface ContentProps extends HTMLAttributes<HTMLDivElement> {
  leftSideBar?: ReactNode;
  rightSideBar?: ReactNode;
}

const Content: FC<ContentProps> = ({
  leftSideBar = "a",
  rightSideBar = "b",
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
      {leftSideBar && (
        <div className="left-side-bar hide-scrollbar">{leftSideBar}</div>
      )}
      <div
        className={classNames(
          "content h-[100vh] pt-22 pb-14 relative overflow-scroll hide-scrollbar",
          className
        )}
      >
        {children}
      </div>
      {rightSideBar && (
        <div className="right-side-bar hide-scrollbar py-22 px-2">
          {rightSideBar}
        </div>
      )}
    </div>
  );
};

export default Content;
