import React from "react";

interface ScaleRulerProps {
  min?: number;
  max?: number;
  step?: number; // 主刻度间隔
  minorStep?: number; // 次刻度间隔
  height?: number; // 高度 px
  unit?: string;
}

const ScaleRuler: React.FC<ScaleRulerProps> = ({
  min = 0,
  max = 100,
  step = 10,
  minorStep = 2,
  height = 300,
  unit = "",
}) => {
  const totalTicks = (max - min) / minorStep;

  const ticks = Array.from({ length: totalTicks + 1 }, (_, idx) => {
    const value = min + idx * minorStep;
    const isMajor = value % step === 0;
    return (
      <div
        key={value}
        style={{
          height: `${height / totalTicks}px`,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: isMajor ? 20 : 10,
            borderBottom: "1px solid black",
            marginRight: 4,
          }}
        />
        {isMajor && (
          <span>
            {value}
            {unit}
          </span>
        )}
      </div>
    );
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid #ccc",
        padding: "4px",
        height,
        overflowY: "auto",
      }}
    >
      {ticks}
    </div>
  );
};

export default ScaleRuler;
