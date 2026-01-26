"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SoundManager, SoundDefinition } from "@/components/Media/soundManager";

export function useSoundManager(defs: SoundDefinition[]) {
  const managerRef = useRef<SoundManager | null>(null);
  const [lastError, setLastError] = useState<string>("");

  if (!managerRef.current) {
    managerRef.current = new SoundManager({ globalVolume: 1, muted: false });
  }

  // 注册音效：只做一次（defs 变化时可自行决定是否重建）
  useEffect(() => {
    const m = managerRef.current!;
    defs.forEach((d) => m.register(d));

    return () => {
      // 如果你希望组件卸载释放资源就 destroy
      // 如果是全局单例，建议放在更高层，不要每次销毁
      // m.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo(() => {
    const m = managerRef.current!;
    return {
      manager: m,
      lastError,
      setMuted: (v: boolean) => m.setMuted(v),
      setGlobalVolume: (v: number) => m.setGlobalVolume(v),

      /**
       * 建议在“第一次用户点击”里先 unlock() 再 play()
       */
      unlock: async () => {
        try {
          setLastError("");
          await m.unlock();
        } catch (e: any) {
          setLastError(e?.name || "unlock error");
        }
      },

      play: async (id: string) => {
        try {
          setLastError("");
          await m.play(id);
        } catch (e: any) {
          const name = e?.name || "Error";
          if (name === "NotAllowedError") {
            setLastError(
              "Browser blocked audio. Ensure play() is called in a click/tap handler.",
            );
          } else {
            setLastError(`Failed to play: ${name}`);
          }
        }
      },

      stop: (id: string) => m.stop(id),
      stopAll: () => m.stopAll(),
    };
  }, [lastError]);

  return api;
}
