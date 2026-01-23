import React from "react";
import { DailyData } from "@/app/daily/page";
import NeuDiv from "@/components/NeuDiv";
import { IconSpinner } from "@/components/Icon/presetIcon";
import WorkoutCard from "./WorkoutCard";
import Tag from "@/components/Tag";
import dayjs from "dayjs";

interface Props {
  dailyData?: DailyData | null;
  loading: boolean;
}

function DailySummary({ dailyData, loading = false }: Props) {
  if (loading) {
    return (
      <NeuDiv>
        <IconSpinner />
      </NeuDiv>
    );
  }
  if (!dailyData) {
    return <NeuDiv>今日暂无训练</NeuDiv>;
  }

  return (
    <NeuDiv neuType="flat">
      <div className="flex justify-between">
        <Tag>
          {dayjs(new Date(dailyData.createdAt!)).format("YYYY-MM-DD HH:mm:ss")}
        </Tag>
        <div className="flex items-center gap-1 py-1!">
          {/* <Footprints className="w-4 h-4" /> */}
          <Tag className="text-slate-700" icon="FootPrint">
            {dailyData.stepCount}
          </Tag>
          {/* <PenLine className="w-4 h-4" /> */}
          <Tag icon="Border_Color" className="text-slate-700">
            {dailyData.stepCount}
          </Tag>
        </div>
      </div>

      <div className="flex">
        {(dailyData.workouts || []).map((w) => {
          return <WorkoutCard key={w.name} data={w} />;
        })}
      </div>
    </NeuDiv>
  );
}

export default DailySummary;
