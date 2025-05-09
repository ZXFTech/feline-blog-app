type MessageHandler = (
  content: string,
  type?: "info" | "success" | "warning" | "error",
  duration?: number
) => void;

let messageHandler: MessageHandler | null = null;

export const message = {
  info: (content: string, duration?: number) =>
    messageHandler?.(content, "info", duration),
  success: (content: string, duration?: number) =>
    messageHandler?.(content, "success", duration),
  warning: (content: string, duration?: number) =>
    messageHandler?.(content, "warning", duration),
  error: (content: string, duration?: number) =>
    messageHandler?.(content, "error", duration),

  // 初始化方法（由 Provider 调用）
  _setHandler: (handler: MessageHandler | null) => {
    messageHandler = handler;
  },
};
