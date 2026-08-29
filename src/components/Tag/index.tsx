import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import Icon, { type IconType } from "../Icon";
import { neuSurfaceClassNames } from "../NeuDiv";

type TagContainerProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children" | "className" | "style" | "onClick" | "onSelect"
>;

interface BaseTagProps {
  children: ReactNode;
  color?: string;
  icon?: IconType;
  className?: string;
  style?: CSSProperties;
  containerProps?: TagContainerProps;
}

type StaticTagProps = BaseTagProps & {
  onSelect?: never;
  onClose?: never;
  closeLabel?: never;
};

type SelectableTagProps = BaseTagProps & {
  onSelect: () => void;
  onClose?: never;
  closeLabel?: never;
};

type ClosableTagProps = BaseTagProps & {
  onSelect?: never;
  onClose: () => void;
  closeLabel?: string;
};

type SelectableClosableTagProps = BaseTagProps & {
  onSelect: () => void;
  onClose: () => void;
  closeLabel?: string;
};

export type TagProps =
  | StaticTagProps
  | SelectableTagProps
  | ClosableTagProps
  | SelectableClosableTagProps;

function TagContent({
  children,
  icon,
  hasCloseAction,
}: Pick<BaseTagProps, "children" | "icon"> & {
  hasCloseAction: boolean;
}) {
  return (
    <>
      {icon ? (
        <Icon className="ml-1 text-xs/0.5! tag-icon" icon={icon} />
      ) : null}
      <span
        className={cn(
          icon ? "ml-0.5" : "ml-2",
          hasCloseAction ? "mr-0.5" : "mr-2",
          "text-xs font-medium whitespace-nowrap",
        )}
      >
        {children}
      </span>
    </>
  );
}

export default function Tag(props: TagProps) {
  const {
    children,
    color,
    icon,
    className,
    style,
    containerProps,
    onSelect,
    onClose,
    closeLabel,
  } = props;
  const surfaceClassName = neuSurfaceClassNames({
    surface: "embossed",
    intensity: "sm",
    className: cn(
      "tag group px-0! py-1! mx-0.5! my-1.25! font-medium inline-flex justify-center items-center",
      (onSelect || onClose) && "cursor-pointer",
      className,
    ),
  });
  const surfaceStyle = { color, ...style };
  const resolvedCloseLabel =
    closeLabel ??
    (typeof children === "string" ? `移除${children}` : undefined);

  if (onClose && !resolvedCloseLabel) {
    throw new Error(
      "A closable Tag with non-text children requires closeLabel.",
    );
  }

  if (!onClose && onSelect) {
    return (
      <span {...containerProps} className="contents">
        <button
          type="button"
          className={surfaceClassName}
          style={surfaceStyle}
          onClick={onSelect}
        >
          <TagContent icon={icon} hasCloseAction={false}>
            {children}
          </TagContent>
        </button>
      </span>
    );
  }

  if (onClose) {
    return (
      <span
        {...containerProps}
        className={surfaceClassName}
        style={surfaceStyle}
      >
        {onSelect ? (
          <button
            type="button"
            className="inline-flex items-center border-0 bg-transparent p-0 text-inherit font-inherit"
            onClick={onSelect}
          >
            <TagContent icon={icon} hasCloseAction>
              {children}
            </TagContent>
          </button>
        ) : (
          <span className="inline-flex items-center">
            <TagContent icon={icon} hasCloseAction>
              {children}
            </TagContent>
          </span>
        )}
        <button
          type="button"
          aria-label={resolvedCloseLabel}
          className="mr-1 inline-flex border-0 bg-transparent p-0 text-inherit font-inherit"
          onClick={onClose}
        >
          <Icon
            aria-hidden="true"
            icon="close"
            className="text-xs/0.5! group-hover:rotate-180 duration-200 ease-in-out"
          />
        </button>
      </span>
    );
  }

  return (
    <span {...containerProps} className={surfaceClassName} style={surfaceStyle}>
      <TagContent icon={icon} hasCloseAction={false}>
        {children}
      </TagContent>
    </span>
  );
}
