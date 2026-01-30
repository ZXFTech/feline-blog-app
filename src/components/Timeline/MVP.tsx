"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import NeuButton from "../NeuButton";

import { Virtuoso } from "react-virtuoso";
import logger from "@/lib/logger/Logger";

export function getDateRange(date: Date, offset: number): Date[] {
  const dayList = [];
  if (offset >= 0) {
    for (let i = 1; i <= offset; i++) {
      const d = new Date(date);
      const today = d.getDate();
      const day = new Date(d.setDate(today + i));
      dayList.push(day);
    }
  } else {
    const absOffset = -offset;
    for (let i = 0; i < absOffset; i++) {
      const d = new Date(date);
      const today = d.getDate();
      const day = new Date(d.setDate(offset + i + today));
      dayList.push(day);
    }
  }

  return dayList;
}

export interface Partner {
  name: string;
  avatar: string;
}

export interface timelineData {
  date: Date;
  title: string;
  detail?: string;
  partner?: Partner[];
  storyline?: string;
}

interface Props {
  timelineData: timelineData[];
}

const INITIAL_FIRST_INDEX = 100000; // 关键：保持 firstItemIndex 为正数（常用大数起步）

async function fetchBefore(beforeDate?: Date): Promise<Date[]> {
  // 真实项目里：用 beforeId / cursor 向上翻页
  await new Promise((r) => setTimeout(r, 300));
  return getDateRange(beforeDate ?? new Date(), -20);
}

// 模拟接口：拉“更新”的数据（向下）
async function fetchBehind(afterDate?: Date): Promise<Date[]> {
  await new Promise((r) => setTimeout(r, 300));
  return getDateRange(afterDate ?? new Date(), 20);
}

function Timeline({ timelineData }: Props) {
  logger.log(timelineData);
  const [date, setDate] = useState<Date[]>([]);

  const [firstItemIndex, setFirstItemIndex] = useState(
    INITIAL_FIRST_INDEX + 20,
  );

  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingBottom, setLoadingBottom] = useState(false);

  const topDate = useMemo(() => {
    return date[0];
  }, [date]);

  const bottomDate = useMemo(() => {
    return date[date.length - 1];
  }, [date]);

  useEffect(() => {
    const getInitialDate = async () => {
      // const before = await fetchBefore();
      const after = await fetchBehind();

      const initial = [new Date(), ...after];
      setDate(initial);
    };

    getInitialDate();
  }, []);

  const loadTop = useCallback(async () => {
    let hasMoreTop = true;
    if (!hasMoreTop || loadingTop) return;
    setLoadingTop(true);
    try {
      const older = await fetchBefore(topDate);
      if (older.length > 0) {
        // 关键：先 prepend 数据，再把 firstItemIndex 往回减
        setDate((cur) => [...older, ...cur]);
        setFirstItemIndex((i) => i - older.length);
      } else {
        hasMoreTop = false;
      }
    } finally {
      setLoadingTop(false);
    }
  }, [loadingTop, topDate]);

  const loadBottom = useCallback(async () => {
    let hasMoreBottom = true;
    if (!hasMoreBottom || loadingBottom) return;
    setLoadingBottom(true);
    try {
      const newer = await fetchBehind(bottomDate);
      if (newer.length > 0) {
        // 向下 append：直接追加即可；firstItemIndex 不变
        setDate((cur) => [...cur, ...newer]);
      } else {
        hasMoreBottom = false;
      }
    } finally {
      setLoadingBottom(false);
    }
  }, [loadingBottom, bottomDate]);

  return (
    <div className="timeline-container h-[100%]">
      <div className="timeline-operation">
        <NeuButton onClick={() => setFirstItemIndex(INITIAL_FIRST_INDEX)}>
          回到今天
        </NeuButton>
      </div>
      <div className="timeline-scroller overflow-scroll h-[100%] pb-3">
        <Virtuoso
          style={{ height: "100%" }}
          data={date}
          firstItemIndex={firstItemIndex}
          // 关键：用稳定 key，避免 prepend/append 时 DOM 重建造成跳动
          computeItemKey={(_, item) => item.toISOString()}
          // 向上：触达顶部
          startReached={() => {
            // 注意：加 loadingTop 防重入，避免连续触发并发请求
            void loadTop();
          }}
          // 向下：触达底部
          endReached={() => {
            void loadBottom();
          }}
          itemContent={(_, item) => (
            <div
              key={_ + "_" + item.toISOString()}
              className="border-b border-slate-100 px-3 py-2 text-sm"
            >
              <div className="text-slate-900">{item.toISOString()}</div>
            </div>
          )}
        />
      </div>
    </div>
  );
}

export default Timeline;
