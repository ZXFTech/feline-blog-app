import { NeuType } from "@/types";
import React, { FC, HTMLAttributes, ReactNode } from "react";
import NeuDiv from "../NeuDiv/NeuDiv";
import Icon from "../Icon/icon";
import classNames from "classnames";

interface TagProps extends HTMLAttributes<HTMLElement> {
  color?: string;
  closable?: boolean;
  onClose?: () => void;
  neuType?: NeuType;
  icon?: string;
}

const Tag: FC<TagProps> = ({
  children,
  closable = false,
  onClose,
  color,
  icon,
  className,
  ...restProps
}) => {
  const combineClassNames = classNames("tag", className);
  return (
    <NeuDiv
      style={{ color }}
      intensity="sm"
      className={`group !px-0 !py-1 !mx-0.5 !my-1.25 font-medium flex justify-center items-center ${
        closable ? "cursor-pointer" : ""
      } ${combineClassNames}`}
      {...restProps}
    >
      {icon && <Icon className="ml-1 !text-xs/0.5 tag-icon" icon={icon} />}
      <span
        className={`${icon ? "ml-0.5" : "ml-2"} ${
          closable ? "mr-0.5" : "mr-2"
        }`}
      >
        {children}
      </span>
      {closable && (
        <Icon
          icon="close"
          className="mr-1 !text-xs/0.5 group-hover:rotate-180 duration-200 ease-in-out"
          onClick={onClose}
        />
      )}
    </NeuDiv>
  );
};

export default Tag;
