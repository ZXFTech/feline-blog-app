"use client";
import { useSyncExternalStore, type ComponentProps } from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

// Keep controls inactive until their event handlers can receive user input.
// The style utilities stay usable from server components.
export function ButtonControl({ disabled, ...props }: ButtonPrimitive.Props) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return <ButtonPrimitive {...props} disabled={disabled || !ready} />;
}
export function InputControl({ disabled, ...props }: ComponentProps<"input">) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return <input {...props} disabled={disabled || !ready} />;
}
