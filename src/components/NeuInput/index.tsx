import {
  ChangeEvent,
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useRef,
  useState,
} from "react";
import Icon, { IconSize } from "../Icon";
import { composeRef } from "@/utils/composeRef";
import NeuDiv from "../NeuDiv";

export const iconSizeMap = {
  xs: "8",
  sm: "12",
  md: "16",
  lg: "20",
  xl: "24",
  "2xl": "28",
  "3xl": "32",
};

interface BaseNeuInputProps {
  inputSize: IconSize;
  loading?: boolean;
  textArea?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  search?: boolean;
  onClear?: () => void;
  allowClear?: boolean;
}

// 配置联合类型
type InputProps = BaseNeuInputProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "size">;
type TextareaProps = BaseNeuInputProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "prefix" | "size">;

export type NeuInputProps = Partial<InputProps & TextareaProps>;

const inputSizeMap = {
  xs: { p: "1", font: "text-xs" },
  sm: { p: "1", font: "text-sm" },
  md: { p: "1", font: "text-base" },
  lg: { p: "1", font: "text-lg" },
  xl: { p: "1", font: "text-xl" },
  "2xl": { p: "2", font: "text-2xl" },
  "3xl": { p: "2", font: "text-2xl" },
};

const NeuInput = forwardRef<
  HTMLInputElement & HTMLTextAreaElement,
  NeuInputProps
>(
  (
    {
      className = "",
      textArea,
      suffix,
      prefix,
      allowClear,
      onClear,
      onChange,
      inputSize = "md",
      value,
      defaultValue,
      ...restProps
    },
    ref
  ) => {
    const internalRef = useRef<HTMLInputElement>(null);
    const mergedRef = composeRef(internalRef, ref);

    const isControlled = value !== undefined;
    const [innerValue, setInnerValue] = useState(defaultValue ?? "");
    const mergedValue = isControlled ? value : innerValue;

    const handleChange = (
      e: ChangeEvent<HTMLInputElement> & ChangeEvent<HTMLTextAreaElement>
    ) => {
      if (!isControlled) {
        setInnerValue(e.target.value);
      }
      onChange?.(e);
    };

    const handleClear = (e: ChangeEvent<HTMLInputElement>) => {
      internalRef.current?.focus();
      if (!isControlled) {
        setInnerValue("");
      }
      onClear?.();
      onChange?.(e);
    };

    if (textArea) {
      return (
        <textarea
          value={mergedValue}
          onChange={handleChange}
          ref={ref}
          {...restProps}
          className={`neu-input resize-none! bg-black/3 focus:outline-none rounded-md focus:bg-white/10 hide-scrollbar disabled:bg-gray-500/20 disabled:opacity-60 ${className}`}
        />
      );
    }
    return (
      <NeuDiv
        neuType="flat"
        className={`p-0! rounded-lg flex items-stretch bg-black/3 rounded-lg ${className}`}
      >
        {prefix ? (
          <div
            className={`input-prefix p-${inputSizeMap[inputSize].p} ${inputSizeMap[inputSize].font} flex items-center`}
            onClick={() => internalRef?.current?.focus()}
          >
            {prefix}
          </div>
        ) : null}
        <NeuDiv
          neuType="debossed"
          intensity="sm"
          className={`input-container relative flex items-center grow-1 p-1! m-0! ${
            prefix ? "rounded-l-none" : "rounded-l-lg"
          } ${suffix ? "rounded-r-none" : "rounded-r-lg"}`}
        >
          <input
            ref={mergedRef}
            {...restProps}
            className={`${inputSizeMap[inputSize].font} p-${inputSizeMap[inputSize].p} focus:bg-white/10 focus:outline-none disabled:bg-gray-500/20 disabled:opacity-60 grow-1`}
            value={mergedValue}
            onChange={handleChange}
          />
          {allowClear && mergedValue ? (
            <Icon
              icon="clear"
              size="sm"
              className="input-clear absolute right-2 top-[50%-6] cursor-pointer rounded-full bg-stone-400 hover:bg-stone-300"
              onClick={(e) =>
                handleClear(e as unknown as ChangeEvent<HTMLInputElement>)
              }
            >
              x
            </Icon>
          ) : null}
        </NeuDiv>
        {suffix ? (
          <div
            className={`input-suffix p-${inputSizeMap[inputSize].p} ${inputSizeMap[inputSize].font} flex items-center`}
          >
            {suffix}
          </div>
        ) : null}
      </NeuDiv>
    );
  }
);

NeuInput.displayName = "NeuInput";

export default NeuInput;
