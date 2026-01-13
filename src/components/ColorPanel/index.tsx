import { Dispatch, ReactNode, SetStateAction, useMemo } from "react";
import NeuDiv from "../NeuDiv";
import colors from "tailwindcss/colors";

type TailwindColors = typeof colors;
type ColorKeys = keyof TailwindColors;

interface Props {
  onColorPicked: (targetColor: string) => void;
  visible?: boolean;
  setVisible?: Dispatch<SetStateAction<boolean>>;
  children?: ReactNode;
}

const ColorPanel = ({
  onColorPicked,
  setVisible,
  visible = false,
  children,
}: Props) => {
  // const [panelVisible, setPanelVisible] = useState(false);

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
      {children}
      {visible ? (
        <NeuDiv className="absolute overflow-auto hide-scrollbar p-2! top-[70%] left-[-1250%] z-100 bg-linear-to-b from-black/50 to-white/60">
          <div className="w-[100%] flex">
            {colorListMap.map((list) => (
              <div
                className="flex flex-col"
                key={list.map((item) => item.name).join("")}
              >
                {list.map((item) => (
                  <div
                    onMouseEnter={() => onColorPicked(item.color)}
                    onMouseLeave={() => onColorPicked("")}
                    className="h-4 w-4 m-[2px] cursor-pointer"
                    onClick={() => {
                      onColorPicked(item.color);
                      setVisible!(false);
                    }}
                    key={item.name}
                    style={{
                      color: item.color,
                      background: item.color,
                    }}
                  ></div>
                ))}
              </div>
            ))}
          </div>
        </NeuDiv>
      ) : null}
    </div>
  );
};

export default ColorPanel;
