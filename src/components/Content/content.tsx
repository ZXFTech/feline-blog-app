import React, { FC, HTMLAttributes, ReactNode } from "react";

interface ContentProps extends HTMLAttributes<HTMLDivElement> {
  leftSideBar?: ReactNode;
  rightSideBar?: ReactNode;
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
      className={`content w-full flex  justify-center ${className || ""}`}
    >
      {leftSideBar && (
        <div className="hidden lh:block w-[20%]]">{leftSideBar}</div>
      )}
      <div className="w-2xl md:w-2xl xl:w-2xl h-[100vh] overflow-scroll hide-scrollbar pt-19 pb-10 relative">
        {children}
      </div>
      {rightSideBar && (
        <div className="hidden md:block w-[25%] h-[100vh] overflow-scroll hide-scrollbar pt-23 pb-10 px-4">
          {rightSideBar}
        </div>
      )}
    </div>
  );
};

export default Content;
