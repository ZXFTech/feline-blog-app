// import { Cast } from "lucide-react";
// import { timelineData } from ".";

// type DayRow = {
//   dayKey: string; // 例如 "2026-01-26"
//   date: Date; // 这一天的 Date（可选）
//   items: timelineData[]; // 这一天对应的所有事件
// };

// function toDayKeyLocal(d: string | number | Date): string {
//   const dt = d instanceof Date ? d : new Date(d);
//   const y = dt.getFullYear();
//   const m = String(dt.getMonth() + 1).padStart(2, "0");
//   const day = String(dt.getDate()).padStart(2, "0");
//   return `${y}-${m}-${day}`;
// }

// function mergePageIntoBuckets(
//   pageItems: timelineData[],
//   itemsByDay: Map<string, timelineData[]>,
// ) {
//   for (const it of pageItems) {
//     // if (seenIds.has(it.id)) continue;
//     // seenIds.add(it.id);

//     const key = toDayKeyLocal(it.date);
//     const arr = itemsByDay.get(key);
//     if (arr) arr.push(it);
//     else itemsByDay.set(key, [it]);
//   }

//   // 可选：每个桶内部按时间排序（稳定展示）
//   for (const [k, arr] of itemsByDay) {
//     arr.sort((a, b) => +new Date(a.date) - +new Date(b.date));
//   }
// }

// function buildDayRows(
//   start: Date,
//   end: Date,
//   itemsByDay: Map<string, timelineData[]>,
// ): DayRow[] {
//   const rows: DayRow[] = [];
//   const cur = new Date(start);

//   // 归零到当天 00:00，避免跨天误差
//   cur.setHours(0, 0, 0, 0);

//   const endCopy = new Date(end);
//   endCopy.setHours(0, 0, 0, 0);

//   while (cur <= endCopy) {
//     const key = toDayKeyLocal(cur);
//     rows.push({
//       dayKey: key,
//       date: new Date(cur),
//       items: itemsByDay.get(key) ?? [],
//     });
//     cur.setDate(cur.getDate() + 1);
//   }

//   return rows;
// }

// export { buildDayRows, mergePageIntoBuckets, toDayKeyLocal };
