import { cn } from '@/lib/utils';
import { HTMLAttributes, ReactNode } from 'react';

interface ContentProps extends HTMLAttributes<HTMLDivElement> {
  leftSideBar?: ReactNode;
  rightSideBar?: ReactNode;
}

export default function Content({
  leftSideBar,
  rightSideBar,
  children,
  className,
  ...restProps
}: ContentProps) {
  const hasLeftSideBar = Boolean(leftSideBar);
  const hasRightSideBar = Boolean(rightSideBar);
  return (
    <div {...restProps} className="content-container relative hide-scrollbar">
      <div
        className="content-grid"
        data-has-left={hasLeftSideBar || undefined}
        data-has-right={hasRightSideBar || undefined}
      >
        <div
          id="content"
          className={cn(
            'content relative overflow-auto hide-scrollbar pt-22 px-3 pb-14',
            className
          )}
        >
          {children}
        </div>
        {rightSideBar ? (
          <aside className="right-side-bar hide-scrollbar pt-22 pb-14 px-2" aria-label="页面操作">
            {rightSideBar}
          </aside>
        ) : null}
        {leftSideBar ? (
          <aside className="left-side-bar hide-scrollbar pt-22 pb-14 px-2" aria-label="页面信息">
            {leftSideBar}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
