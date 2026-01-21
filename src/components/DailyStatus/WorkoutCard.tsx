import React from "react";
import { DailyData, WorkoutData } from "./ClientPart";
import NeuProgressBar from "@/components/NeuProgressBar";
import { Dumbbell, Flame, Logs, TimerIcon } from "lucide-react";
import NeuTag from "@/components/Tag";
import NeuDiv from "@/components/NeuDiv";

interface Props {
  data: WorkoutData;
}

function WorkoutCard({ data }: Props) {
  return (
    <div className="p-2 ">
      <NeuTag className="mb-4!">{data.name}</NeuTag>
      <div className="flex gap-4 flex-wrap">
        {data.sets.map((s, i) => (
          <NeuDiv
            neuType="embossed"
            key={s.calories + "_" + i}
            className="border p-2 rounded-md flex gap-2"
          >
            <div>
              <div className="flex gap-1 items-center mb-2">
                <TimerIcon className="text-sky-500" size="16"></TimerIcon>
                <span className="text-sky-500 whitespace-nowrap">
                  {s.duration} min
                </span>
              </div>

              <div className="flex gap-1 items-center">
                <Flame size={16} className="text-orange-700" />
                <span className="text-orange-700 whitespace-nowrap">
                  {s.calories} kcal
                </span>
              </div>
            </div>
            <div>
              {s.duration ? (
                <div className="flex gap-1 items-center mb-2">
                  <Logs size={16} className="text-pink-800" />
                  <span className="text-pink-800 whitespace-nowrap">
                    {s.duration} 次
                  </span>
                </div>
              ) : null}
              {s.duration ? (
                <div className="flex gap-1 items-center">
                  <Dumbbell size={16} className="text-indigo-800" />
                  <span className="text-indigo-800 whitespace-nowrap">
                    {s.duration} kg
                  </span>
                </div>
              ) : null}
            </div>
          </NeuDiv>
        ))}
      </div>
    </div>
  );
}

export default WorkoutCard;
