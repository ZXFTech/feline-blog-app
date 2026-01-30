// "use client";

// import React, {
//   useCallback,
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
// } from "react";
// import NeuButton from "../NeuButton";

// import { Virtuoso } from "react-virtuoso";
// import { getMockTimelineData } from "./mockData";
// import TimelineCard from "./TimelineCard";
// import { buildDayRows, mergePageIntoBuckets, toDayKeyLocal } from "./utils";

// export function getDateRange(date: Date, offset: number): Date[] {
//   const dayList = [];
//   if (offset >= 0) {
//     for (let i = 1; i <= offset; i++) {
//       const d = new Date(date);
//       const today = d.getDate();
//       const day = new Date(d.setDate(today + i));
//       dayList.push(day);
//     }
//   } else {
//     const absOffset = -offset;
//     for (let i = 0; i < absOffset; i++) {
//       const d = new Date(date);
//       const today = d.getDate();
//       const day = new Date(d.setDate(offset + i + today));
//       dayList.push(day);
//     }
//   }

//   return dayList;
// }

// export interface Partner {
//   name: string;
//   avatar: string;
// }

// export interface timelineData {
//   date: Date;
//   title: string;
//   detail?: string;
//   partner?: Partner[];
//   storyline?: string;
// }

// interface Props {
//   timelineData: timelineData[];
// }

// const INITIAL_FIRST_INDEX = 100000; // 关键：保持 firstItemIndex 为正数（常用大数起步）

// async function fetchBefore(beforeDate?: Date): Promise<Date[]> {
//   // 真实项目里：用 beforeId / cursor 向上翻页
//   await new Promise((r) => setTimeout(r, 300));
//   return getDateRange(beforeDate ?? new Date(), -20);
// }

// // 模拟接口：拉“更新”的数据（向下）
// async function fetchBehind(afterDate?: Date): Promise<Date[]> {
//   await new Promise((r) => setTimeout(r, 300));
//   return getDateRange(afterDate ?? new Date(), 20);
// }

// function Timeline({ timelineData }: Props) {
//   const [date, setDate] = useState<Date[]>([]);

//   const [range, setRange] = useState(() => {
//     const start = new Date();
//     const end = new Date();
//     start.setDate(start.getDate() - 20);
//     return { start, end };
//   });

//   const [data, setData] = useState<timelineData[]>([]);
//   // 用 version 触发 rows 重新计算（Map 在 ref 里不会变引用）
//   const [version, setVersion] = useState(0);
//   const [firstItemIndex, setFirstItemIndex] = useState(
//     INITIAL_FIRST_INDEX + 20,
//   );

//   const itemsByDayRef = useRef<Map<string, timelineData[]>>(new Map());
//   const seenIds = useRef<Set<string>>(new Set());
//   const rows = useMemo(() => {
//     return buildDayRows(range.start, range.end, itemsByDayRef.current);
//   }, [range, version]);

//   function getTimelineData() {
//     const page: timelineData[] = getMockTimelineData(
//       range.start,
//       range.end,
//       10,
//     );
//     for (const item of page) {
//       const key = toDayKeyLocal(item.date);
//       const arr = itemsByDayRef.current.get(key);
//       if (arr) {
//         arr.push(item);
//       } else {
//         itemsByDayRef.current.set(key, [item]);
//       }
//     }

//     // 可选：桶内排序（按时间）
//     for (const arr of itemsByDayRef.current.values()) {
//       arr.sort((a, b) => +new Date(a.date) - +new Date(b.date));
//     }

//     setVersion((v) => v + 1);
//   }

//   const [loadingTop, setLoadingTop] = useState(false);
//   const [loadingBottom, setLoadingBottom] = useState(false);

//   const topDate = useMemo(() => {
//     return date[0];
//   }, [date]);

//   const bottomDate = useMemo(() => {
//     return date[date.length - 1];
//   }, [date]);

//   // useEffect(() => {
//   //   const getInitialDate = async () => {
//   //     // const before = await fetchBefore();
//   //     const after = await fetchBehind();

//   //     const afterDay = getDateRange(new Date(), 20);
//   //     const data = getMockTimelineData(
//   //       new Date(),
//   //       afterDay[afterDay.length - 1],
//   //       20,
//   //     );

//   //     const initial = [new Date(), ...after];
//   //     setDate(initial);
//   //     setData(data);
//   //   };

//   //   getInitialDate();
//   // }, []);

//   // const loadTop = useCallback(async () => {
//   //   let hasMoreTop = true;
//   //   if (!hasMoreTop || loadingTop) return;
//   //   setLoadingTop(true);
//   //   try {
//   //     const older = await fetchBefore(topDate);
//   //     if (older.length > 0) {
//   //       // 关键：先 prepend 数据，再把 firstItemIndex 往回减
//   //       setDate((cur) => [...older, ...cur]);
//   //       setFirstItemIndex((i) => i - older.length);
//   //     } else {
//   //       hasMoreTop = false;
//   //     }
//   //   } finally {
//   //     setLoadingTop(false);
//   //   }
//   // }, [loadingTop, topDate]);

//   const loadBottom = useCallback(async () => {
//     let hasMoreBottom = true;
//     if (!hasMoreBottom || loadingBottom) return;
//     setLoadingBottom(true);
//     try {
//       const newer = await fetchBehind(bottomDate);
//       const bottomData = getMockTimelineData(20);

//       if (newer.length > 0) {
//         // 向下 append：直接追加即可；firstItemIndex 不变
//         setDate((cur) => [...cur, ...newer]);
//         setData((prev) => [...prev, ...olderData]);
//       } else {
//         hasMoreBottom = false;
//       }
//     } finally {
//       setLoadingBottom(false);
//     }
//   }, [loadingBottom, bottomDate]);
//   function loadNext(days: number) {
//     setRange((prev) => {
//       const nextEnd = new Date(prev.end);
//       nextEnd.setDate(nextEnd.getDate() + days);

//       return { ...prev, end: nextEnd };
//     });
//   }

//   return (
//     <div className="timeline-container h-[100%]">
//       <div className="timeline-operation">
//         <NeuButton onClick={() => setFirstItemIndex(INITIAL_FIRST_INDEX)}>
//           回到今天
//         </NeuButton>
//         <NeuButton onClick={() => getTimelineData()}>获取数据</NeuButton>
//       </div>
//       <div className="timeline-scroller overflow-scroll h-[100%] pb-3">
//         <Virtuoso
//           style={{ height: "100%" }}
//           data={data}
//           firstItemIndex={firstItemIndex}
//           // 关键：用稳定 key，避免 prepend/append 时 DOM 重建造成跳动
//           computeItemKey={(_, item) => item.date + "_" + item.title}
//           // 向上：触达顶部
//           // startReached={() => {
//           //   // 注意：加 loadingTop 防重入，避免连续触发并发请求
//           //   void loadTop();
//           // }}
//           // 向下：触达底部
//           endReached={() => {
//             void loadNext(20);
//           }}
//           itemContent={(_, item) => <TimelineCard timeline={item} />}
//         />
//       </div>
//     </div>
//   );
// }

// export default Timeline;
