import { useEffect, useState } from "react";

interface UseTypewriterOptions {
  text: string;
  speed?: number; // ms per character
  enabled?: boolean;
}

export function useTypewriter({
  text,
  speed = 80,
  enabled = true,
}: UseTypewriterOptions) {
  const [displayText, setDisplayText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    // reset when text changes
    setDisplayText("");
    setIndex(0);
  }, [text, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (index >= text.length) return;

    const timer = setTimeout(() => {
      setDisplayText((prev) => prev + text[index]);
      setIndex((i) => i + 1);
    }, speed);

    return () => clearTimeout(timer);
  }, [index, text, speed, enabled]);

  return displayText;
}
