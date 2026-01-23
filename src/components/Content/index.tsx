import classNames from "classnames";
import { FC, HTMLAttributes, ReactNode } from "react";

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
      className={classNames(
        "content-container relative flex justify-center gap-8 hide-scrollbar",
      )}
    >
      {leftSideBar ? (
        <div className="left-side-bar hide-scrollbar pt-22 flex flex-col">
          {leftSideBar}
        </div>
      ) : null}
      <div
        id="content"
        className={classNames(
          "content h-[100vh] pb-14 relative overflow-scroll hide-scrollbar pt-22",
          className,
        )}
      >
        {children}
      </div>
      {rightSideBar ? (
        <div className="right-side-bar hide-scrollbar pt-22 flex flex-col">
          {rightSideBar}
        </div>
      ) : null}
    </div>
  );
};

export default Content;
