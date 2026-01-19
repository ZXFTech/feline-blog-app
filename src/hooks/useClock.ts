import { useState, useEffect } from "react";

export const useClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    let timer: number;

    const tick = () => {
      const now = new Date();
      setTime(now);

      // 对齐到下一秒
      timer = window.setTimeout(tick, 1000 - (now.getTime() % 1000));
    };

    tick();

    return () => clearTimeout(timer);
  }, []);

  return {
    time,
  };
};
