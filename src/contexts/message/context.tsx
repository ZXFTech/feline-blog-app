"use client";

import { createContext, useContext, useState } from "react";

export type MessageType = "info" | "success" | "error" | "warning";
export interface Message {
  id: string;
  type: MessageType;
  content: string;
  duration: number;
  paused: boolean;
  remaining: number;
  start: number;
}

const MessageContext = createContext<{
  messages: Message[];
  addMessage: (content: string, type?: MessageType, duration?: number) => void;
  removeMessage: (id: string) => void;
  pauseMessage: (id: string) => void;
  resumeMessage: (id: string) => void;
  updateMessageState: (id: string, remaining: number, start: number) => void;
} | null>(null);

export function MessageProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);

  const addMessage = (
    content: string,
    type: MessageType = "info",
    duration = 3000
  ) => {
    const id = Math.random().toString(36).slice(2);
    setMessages((prev) => [
      ...prev,
      {
        id,
        content,
        type,
        duration,
        remaining: duration,
        paused: false,
        start: Date.now(),
      },
    ]);
  };

  const pauseMessage = (id: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === id) {
          return { ...msg, paused: true };
        }
        return msg;
      })
    );
  };

  const updateMessageState = (id: string, remaining: number, start: number) => {
    setMessages((prev) =>
      prev.filter((msg) => {
        if (msg.id === id) {
          return { ...msg, remaining, start };
        }
        return msg;
      })
    );
  };

  const resumeMessage = (id: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === id) {
          return { ...msg, paused: false };
        }
        return msg;
      })
    );
  };

  const removeMessage = (id: string) => {
    setMessages((prev) => prev.filter((msg) => msg.id !== id));
  };

  return (
    <MessageContext.Provider
      value={{
        messages,
        addMessage,
        removeMessage,
        pauseMessage,
        resumeMessage,
        updateMessageState,
      }}
    >
      {children}
    </MessageContext.Provider>
  );
}

export const useMessage = () => {
  const context = useContext(MessageContext);
  if (!context)
    throw new Error("useMessage must be used within MessageProvider");
  return context; // 直接返回方法
};
