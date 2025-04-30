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
    <div className={combineClassnames} {...restProps}>
      {leftSideBar && <div className="left-side-bar">{leftSideBar}</div>}
      <div className="main">{children}</div>
      {rightSideBar && <div className="right-side-bar">{rightSideBar}</div>}
    </div>
  );
};

export default Content;
