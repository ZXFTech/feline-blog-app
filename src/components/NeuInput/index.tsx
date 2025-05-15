import { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface BaseNeuInputProps {}

// 配置联合类型
type InputProps = BaseNeuInputProps & InputHTMLAttributes<HTMLElement>;
type TextareaProps = BaseNeuInputProps & TextareaHTMLAttributes<HTMLElement>;

export type NeuInputProps = Partial<InputProps & TextareaProps>;

interface Props extends InputHTMLAttributes<HTMLElement> {
  loading?: boolean;
  textArea?: boolean;
}

const NeuInput = ({ loading, className, textArea, ...restProps }: Props) => {
  if (textArea) {
    return (
      <textarea
        {...restProps}
        className={`neu-input p-3 resize-none! grow bg-black/3 focus:outline-none rounded-md focus:bg-white/10 hide-scrollbar disabled:bg-gray-500/20 disabled:opacity-60 ${className}`}
      />
    );
  }
  return (
    <input
      {...restProps}
      className={`neu-input bg-black/3 rounded-lg font-medium focus:bg-white/10 focus:outline-none block w-full text-3xl! p-3 disabled:bg-gray-500/20 disabled:opacity-60 ${className}`}
    />
  );
};

export default NeuInput;
