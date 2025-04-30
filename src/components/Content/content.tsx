import classNames from "classnames";
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
  const combineClassnames = classNames("content", className);
  return (
    <div
      className={`mt-15 md:mt-20 w-full flex justify-center ${combineClassnames}`}
      {...restProps}
    >
      <div className="hidden xl:block w-[25%]">{leftSideBar}</div>
      <div className="w-full md:w-[70%] xl:w-[50%]">{children}</div>
      <div className="hidden md:block w-[25%]">{rightSideBar}</div>
    </div>
  );
};

export default Content;
