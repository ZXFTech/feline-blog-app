import Calendar, { RecordDate } from "@/components/Calendar";
import { Pomodoro } from "@/components/pomodoro";
import { getTomatoHistory } from "@/db/tomatoActions";
import { getFirstDateOfMonth, getLastDateOfMonth } from "@/utils/timeUtils";
import dayjs from "dayjs";
import React from "react";

async function Tomato() {
  const today = new Date();
  const startOfMonth = getFirstDateOfMonth(today);
  const endOfMonth = getLastDateOfMonth(today);
  const dataSource = await getTomatoHistory({
    startTime: startOfMonth,
    endTime: endOfMonth,
  });
  const dateRecord: RecordDate[] = dataSource.map((item) => ({
    color: "bg-tomato-record",
    date: item.startAt,
    dateStr: dayjs(item.startAt).format("YYYY-MM-DD"),
  }));

  return (
    <div className="pt-22 pb-14 flex justify-center gap-4">
      <div>
        <Calendar recordDate={dateRecord} />
      </div>
      <div>
        <Pomodoro />
      </div>
      <div></div>
    </div>
  );
}

export default Tomato;
