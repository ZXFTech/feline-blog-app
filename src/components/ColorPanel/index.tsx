import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { NeuSurface } from "@/components/ui/neu-surface";
import colors from "tailwindcss/colors";
import { Button } from "@/components/ui/button";
import Floating from "@/components/Floating";

type TailwindColors = typeof colors;
type ColorKeys = keyof TailwindColors;

interface Props {
  onColorPicked: (targetColor: string) => void;
  color: string;
  colorFilter?: {
    i: number;
    j: number;
  };
}

const ColorPanel = ({ onColorPicked, color, colorFilter = { i: 0, j: 0 } }: Props) => {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (buttonRef.current?.contains(target)) {
        return;
      }
      setVisible(false);
    };

    // 用 mousedown 比 click 更可靠
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible]);

  const colorListMap = useMemo<{ name: string; color: string }[][]>(() => {
    return Object.keys(colors as TailwindColors)
      .filter((color) => typeof colors[color as keyof TailwindColors] === "object")
      .map((key) => ({ name: key, colorList: colors[key as ColorKeys] }))
      .map((item) =>
        Object.keys(item.colorList).map((num) => ({
          name: item.name + "-" + num,
          color: item.colorList[num as keyof typeof item.colorList],
        }))
      );
  }, []);

  return (
    <div className="relative">
      <Button
        aria-label="选择标签颜色"
        aria-expanded={visible}
        ref={buttonRef}
        className="inline-block"
        style={{ color }}
        materialIcon="format_color_text"
        onClick={() => setVisible((prev) => !prev)}
      ></Button>
      <Floating
        anchorRef={buttonRef as RefObject<HTMLButtonElement>}
        open={visible}
        offset={-100}
        align="right"
      >
        <NeuSurface
          ref={panelRef}
          className="overflow-auto hide-scrollbar flex justify-center items-start h-45 w-90 max-w-[calc(100vw-2*var(--spacing-panel-inset-default))] p-[var(--spacing-panel-inset-default)] bg-linear-to-b from-black/30 to-white/20"
        >
          <div className="flex flex-wrap">
            {colorListMap.map((list, i) =>
              i >= colorFilter.i ? (
                <div className="flex flex-col" key={list.map((item) => item.name).join("")}>
                  {list.map((item, j) =>
                    j >= colorFilter.j ? (
                      <button
                        type="button"
                        aria-label={`选择 ${item.name} 颜色`}
                        className="h-4 w-4 m-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        onClick={() => {
                          onColorPicked(item.color);
                          setVisible(false);
                          buttonRef.current?.focus({ preventScroll: true });
                        }}
                        key={item.name}
                        style={{
                          background: item.color,
                        }}
                      ></button>
                    ) : null
                  )}
                </div>
              ) : null
            )}
          </div>
        </NeuSurface>
      </Floating>
    </div>
  );
};

export default ColorPanel;
