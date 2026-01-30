// "use client";

// import { getTodoByTags } from "@/db/todoAction";
// import { useEffect, useMemo, useState } from "react";
// // import { getDateRange } from "@/components/Timeline";
// import NeuDiv from "@/components/NeuDiv";
// import Tag from "@/components/Tag";
// import { TagTodo } from "@/types/todo";

// interface TodoMapItem {
//   [key: string]: TagTodo[][];
// }

// export default function ClientPart() {
//   const [dateRange, setDateRange] = useState(() => {
//     const today = new Date();
//     return {
//       startDate: new Date(today.setDate(today.getDate() - 100)),
//       endDate: new Date(),
//     };
//   });

//   const dateMap = useMemo(() => {
//     return getDateRange(dateRange.endDate, -100);
//   }, [dateRange]);

//   const [todoMap, setTodoMap] = useState<TodoMapItem>({});

//   useEffect(() => {
//     const storyline = ["组件", "页面", "Blog", "Todo", "Tag", "鉴权", "主题"];
//     const getTodoByRange = async () => {
//       const todoList = await getTodoByTags(
//         storyline,
//         dateRange.startDate,
//         dateRange.endDate,
//       );
//       if (!todoList.length) {
//         return;
//       }
//       const formatTodoList = todoList.map((todo) => ({
//         id: todo.id,
//         content: todo.content,
//         finished: todo.finished,
//         createAt: todo.createAt,
//         tags: todo.tags.map((t) => t.tag),
//       }));

//       formatTodoList.forEach((todo) => {
//         const dateKey = new Date(todo.createAt.setHours(0, 0, 0, 0))
//           .toISOString()
//           .split("T")[0];
//         const storylineIndex = storyline.findIndex(
//           (item) => !!todo.tags.find((tag) => tag.content === item),
//         );
//         const todoMapValue = todoMap[dateKey];
//         if (todoMapValue) {
//           // todoMapValue.push(todo);
//           if (todoMapValue[storylineIndex]) {
//             todoMapValue[storylineIndex].push(todo);
//           } else {
//             todoMapValue[storylineIndex] = [todo];
//           }
//         } else {
//           const arr = Array.from(
//             { length: storyline.length },
//             (): TagTodo[] => [],
//           );
//           arr[storylineIndex].push(todo);
//           todoMap[dateKey] = arr;
//         }
//       });
//       setTodoMap((prev) => ({ ...prev }));
//     };
//     getTodoByRange();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [dateRange]);

//   return (
//     <div className="flex flex-col gap-3 bg-bg ">
//       {dateMap.map((date) => {
//         const dateKey = new Date(date.setHours(0, 0, 0, 0))
//           .toISOString()
//           .split("T")[0];
//         return (
//           // date 行
//           <div key={date.toISOString()} className="flex gap-3 min-h-30">
//             <div>{date.toISOString().split("T")[0]}</div>
//             {todoMap[dateKey] ? (
//               // 多列主线
//               <div className="flex gap-3">
//                 {todoMap[dateKey].map((storyline, i) => {
//                   // 单列主线
//                   if (storyline.length) {
//                     return (
//                       <div
//                         key={storyline.toString() + storyline.toString() + i}
//                         className="flex flex-col w-50 min-w-50 gap-3"
//                       >
//                         {storyline.map((todo) => {
//                           return (
//                             <NeuDiv className="w-fit" key={todo.id}>
//                               <div className="flex gap-2 flex-wrap">
//                                 {(todo.tags || []).map((tag) => {
//                                   return (
//                                     // <div
//                                     //   className="whitespace-nowrap"
//                                     //   key={tag.tag.content}
//                                     // >
//                                     //   {tag.tag.content}
//                                     // </div>
//                                     <Tag key={tag.content} color={tag.color}>
//                                       {tag.content}
//                                     </Tag>
//                                   );
//                                 })}
//                               </div>
//                               <div>{todo.content}</div>
//                             </NeuDiv>
//                           );
//                         })}
//                       </div>
//                     );
//                   } else {
//                     return (
//                       <div
//                         className="w-50 min-w-50"
//                         key={date.toISOString() + "_" + i}
//                       ></div>
//                     );
//                   }
//                 })}
//               </div>
//             ) : (
//               <div className="min-h-30"></div>
//             )}
//           </div>
//         );
//       })}
//     </div>
//   );
// }
