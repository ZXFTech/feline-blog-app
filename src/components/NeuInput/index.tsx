import { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { IconSize } from "../Icon/icon";

interface BaseNeuInputProps {
  inputSize: IconSize;
  loading?: boolean;
  textArea?: boolean;
}

// 配置联合类型
type InputProps = BaseNeuInputProps & InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = BaseNeuInputProps &
  TextareaHTMLAttributes<HTMLTextAreaElement>;

export type NeuInputProps = Partial<InputProps & TextareaProps>;

const inputSizeMap = {
  xs: "p-2 text-xs",
  sm: "p-2 text-sm",
  md: "p-2 text-base",
  lg: "p-1 text-lg",
  xl: "p-2 text-xl",
  "2xl": "p-2 text-2xl",
  "3xl": "p-2 text-3xl",
};

const NeuInput = ({
  className,
  textArea,
  inputSize = "md",
  ...restProps
}: NeuInputProps) => {
  if (textArea) {
    return (
      <textarea
        {...restProps}
        className={`neu-input p-3 resize-none! bg-black/3 focus:outline-none rounded-md focus:bg-white/10 hide-scrollbar disabled:bg-gray-500/20 disabled:opacity-60 ${className}`}
      />
    );
  }
  return (
    <input
      {...restProps}
      className={`neu-input bg-black/3 rounded-lg focus:bg-white/10 focus:outline-none block disabled:bg-gray-500/20 disabled:opacity-60 ${inputSizeMap[inputSize]} ${className}`}
    />
  );
};

export default NeuInput;
