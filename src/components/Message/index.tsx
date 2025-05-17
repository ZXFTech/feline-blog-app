"use client";

import { useMessage, Message } from "@/contexts/message/context";
import React, { CSSProperties, useEffect, useRef, useState } from "react";

interface ToastProps {
  message: Message;
  index: number;
  removeMessage: (id: string) => void;
}

const Toast = ({ message, index, removeMessage }: ToastProps) => {
  return (
    <div
      className={`message flex items-center p-4 min-w-[300px] rounded-lg shadow-lg 
            ${
              message.type === "success"
                ? "bg-green-100 text-green-800 border-green-200"
                : message.type === "error"
                ? "bg-red-100 text-red-800 border-red-200"
                : message.type === "warning"
                ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                : "bg-blue-100 text-blue-800 border-blue-200"
            } border`}
    >
      <span className={`mr-2`}>
        {
          {
            success: "✅",
            error: "❌",
            warning: "⚠️",
            info: "ℹ️",
          }[message.type]
        }
      </span>
      <span className="flex-1">{message.content}</span>
      <button
        onClick={() => removeMessage(message.id)}
        className="ml-4 text-gray-500 hover:text-gray-700"
      >
        ×
      </button>
    </div>
  );
};

export function MessageContainer() {
  const {
    messages,
    updateMessageState,
    removeMessage,
    pauseMessage,
    resumeMessage,
  } = useMessage();
  const timerList = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // 自动移除逻辑
  useEffect(() => {
    messages.forEach((msg) => {
      if (!msg.paused && !timerList.current.has(msg.id)) {
        const timer = setTimeout(() => {
          removeMessage(msg.id);
          timerList.current.delete(msg.id);
        }, msg.remaining);
        timerList.current.set(msg.id, timer);
      }
    });

    return () => {
      timerList.current.forEach((timer) => clearTimeout(timer));
      timerList.current.clear();
    };
  }, [messages, removeMessage]);

  const handleMouseEnter = () => {
    messages.forEach((msg) => {
      const remaining = msg.remaining - (Date.now() - msg.start);
      updateMessageState(msg.id, remaining, Date.now());
      clearTimeout(timerList.current.get(msg.id));
      timerList.current.delete(msg.id);
      pauseMessage(msg.id);
    });
  };

  const handleMouseLeave = () => {
    messages.forEach((msg) => {
      const timer = setTimeout(() => {
        removeMessage(msg.id);
        timerList.current.delete(msg.id);
      }, msg.remaining);
      resumeMessage(msg.id);
      timerList.current.set(msg.id, timer);
    });
  };

  return (
    <div
      className="message-container fixed top-2 right-2 z-[99999] space-y-2"
      onMouseEnter={() => handleMouseEnter()}
      onMouseLeave={() => handleMouseLeave()}
    >
      {messages.map((msg, index) => (
        <Toast
          key={msg.id}
          message={msg}
          index={index}
          removeMessage={removeMessage}
        />
      ))}
    </div>
  );
}
