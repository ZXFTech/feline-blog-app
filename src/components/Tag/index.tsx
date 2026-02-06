import { NeuType } from "@/types";
import React, { FC, HTMLAttributes } from "react";
import NeuDiv from "../NeuDiv";
import Icon from "../Icon";
import { cn } from "@/lib/utils";

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
  onClick,
  color,
  icon,
  className,
  ...restProps
}) => {
  const combineClassNames = cn("tag", className);
  return (
    <NeuDiv
      onClick={onClick}
      style={{ color }}
      intensity="sm"
      className={`group px-0! py-1! mx-0.5! my-1.25! font-medium inline-flex justify-center items-center  ${
        closable || onClick ? "cursor-pointer" : ""
      } ${combineClassNames}`}
      {...restProps}
    >
      {icon && <Icon className="ml-1 text-xs/0.5! tag-icon" icon={icon} />}
      <span
        className={`${icon ? "ml-0.5" : "ml-2"} ${
          closable ? "mr-0.5" : "mr-2"
        } text-xs font-medium whitespace-nowrap`}
      >
        {children}
      </span>
      {closable && (
        <Icon
          icon="close"
          className="mr-1 text-xs/0.5! group-hover:rotate-180 duration-200 ease-in-out"
          onClick={onClose}
        />
      )}
    </NeuDiv>
  );
};

export default Tag;
