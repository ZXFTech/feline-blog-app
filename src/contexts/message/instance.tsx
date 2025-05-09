// contexts/message-instance.tsx
"use client";

import { useEffect } from "react";
import { message } from "@/lib/message";
import { useMessage } from "./context";

export function MessageInstanceInitializer() {
  const { addMessage } = useMessage();

  useEffect(() => {
    // 将 add 方法绑定到全局 message 对象
    message._setHandler(addMessage);

    // 清理函数
    return () => {
      message._setHandler(null);
    };
  }, [addMessage]);

  return null;
}
