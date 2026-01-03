import { RefObject, Ref as ReactRef } from "react";

export type Ref<T> = ReactRef<T>;

// 辅助函数：设置 ref 的值
function fillRef<T>(ref: Ref<T>, node: T): void {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref && typeof ref === "object") {
    (ref as RefObject<T>).current = node;
  }
}

// 主函数：合并多个 ref
export function composeRef<T>(...refs: Ref<T>[]): Ref<T> {
  return (node: T) => {
    refs.forEach((ref) => {
      fillRef(ref, node);
    });
  };
}
