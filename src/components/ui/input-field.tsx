"use client";

import {
  useState,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";

type SharedFieldProps = {
  prefix?: ReactNode;
  suffix?: ReactNode;
  clearable?: boolean;
  onClear?: () => void;
  fieldSize?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  inputRef?: Ref<HTMLInputElement>;
};

type SingleLineFieldProps = SharedFieldProps &
  Omit<ComponentPropsWithoutRef<"input">, "prefix" | "size"> & { multiline?: false };

type MultiLineFieldProps = SharedFieldProps &
  Omit<ComponentPropsWithoutRef<"textarea">, "prefix"> & { multiline: true };

export type InputFieldProps = SingleLineFieldProps | MultiLineFieldProps;

export function InputField(props: InputFieldProps) {
  const [internalValue, setInternalValue] = useState(props.defaultValue ?? "");

  if (props.multiline) {
    const { multiline, prefix, suffix, clearable, onClear, fieldSize, inputRef, ...textareaProps } =
      props;
    void multiline;
    void prefix;
    void suffix;
    void clearable;
    void onClear;
    void fieldSize;
    void inputRef;
    return <Textarea {...textareaProps} />;
  }

  const {
    prefix,
    suffix,
    clearable,
    onClear,
    fieldSize,
    inputRef: externalRef,
    value,
    defaultValue,
    onChange,
    className,
    ...inputProps
  } = props;
  void fieldSize;
  void defaultValue;
  const controlled = value !== undefined;
  const currentValue = controlled ? value : internalValue;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!controlled) setInternalValue(event.target.value);
    onChange?.(event);
  };

  const clear = (event: MouseEvent<HTMLButtonElement>) => {
    if (!controlled) setInternalValue("");
    onClear?.();
    event.currentTarget
      .closest('[data-slot="input-group"]')
      ?.querySelector<HTMLInputElement>("input")
      ?.focus();
  };

  if (!prefix && !suffix && !clearable) {
    return (
      <Input
        ref={externalRef}
        className={className}
        value={currentValue}
        onChange={handleChange}
        {...inputProps}
      />
    );
  }

  return (
    <InputGroup className={className}>
      {prefix ? <InputGroupAddon align="inline-start">{prefix}</InputGroupAddon> : null}
      <InputGroupInput
        ref={externalRef}
        value={currentValue}
        onChange={handleChange}
        {...inputProps}
      />
      {clearable && currentValue ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="清空输入" onClick={clear}>
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      ) : suffix ? (
        <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
