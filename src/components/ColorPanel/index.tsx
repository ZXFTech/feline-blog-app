import { useEffect, useMemo, useRef, useState } from "react";
import NeuDiv from "../NeuDiv";
import colors from "tailwindcss/colors";
import NeuButton from "../NeuButton";
import Floating from "../Floating";

type TailwindColors = typeof colors;
type ColorKeys = keyof TailwindColors;

interface Props {
  onColorPicked: (targetColor: string) => void;
  color: string;
  setColor: (color: string) => void;
  colorFilter?: {
    i: number;
    j: number;
  };
}

const ColorPanel = ({
  onColorPicked,
  color,
  setColor,
  colorFilter = { i: 0, j: 0 },
}: Props) => {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      event.preventDefault();
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) {
        return;
      }
      if (buttonRef.current?.contains(target)) {
        // 如果 点击的是 toggle 按钮, 同步取消颜色, 因为是点击的按钮关闭的 panel, 等同于没有选颜色, 点击的空白部分关闭的 panel
        setColor("");
        return;
      }
      setVisible?.(false);
      setColor("");
    };

    // 用 mousedown 比 click 更可靠
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [visible, setVisible, setColor]);

  useEffect(() => {}, []);

  const colorListMap = useMemo<{ name: string; color: string }[][]>(() => {
    return Object.keys(colors as TailwindColors)
      .filter(
        (color) => typeof colors[color as keyof TailwindColors] === "object"
      )
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
      <NeuButton
        ref={buttonRef}
        className="inline-block"
        style={{ color }}
        icon="format_color_text"
        onClick={() => setVisible((prev) => !prev)}
      ></NeuButton>
      <Floating
        anchorRef={buttonRef}
        open={visible}
        offset={-100}
        align="right"
      >
        <NeuDiv
          ref={panelRef}
          className="overflow-auto hide-scrollbar flex justify-center items-center h-45 w-90 bg-linear-to-b from-black/30 to-white/20"
        >
          <div className="flex flex-wrap">
            {colorListMap.map((list, i) =>
              i >= colorFilter.i ? (
                <div
                  className="flex flex-col"
                  key={list.map((item) => item.name).join("")}
                >
                  {list.map((item, j) =>
                    j >= colorFilter.j ? (
                      <div
                        onMouseEnter={() => {
                          onColorPicked(item.color);
                          setColor(item.color);
                        }}
                        onMouseLeave={() => onColorPicked("")}
                        className="h-4 w-4 m-0.5 cursor-pointer"
                        onClick={() => {
                          onColorPicked(item.color);
                          setVisible!(false);
                        }}
                        key={item.name}
                        style={{
                          background: item.color,
                        }}
                      ></div>
                    ) : null
                  )}
                </div>
              ) : null
            )}
          </div>
        </NeuDiv>
      </Floating>
    </div>
  );
};

export default ColorPanel;
