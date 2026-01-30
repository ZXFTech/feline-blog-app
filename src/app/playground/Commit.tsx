"use client";

import React, { useMemo } from "react";
import { layoutCommits } from "./layoutFunc";

export type Commit = {
  id: string;
  parents: string[]; // 0~n 个父节点（merge 就是 >1）
  message: string;
  author?: string;
  date?: string;
};

type Props = {
  commits: Commit[];
  rowHeight?: number;
  laneGap?: number;
  graphWidth?: number;
};

function laneColor(lane: number) {
  // 固定映射：lane -> HSL（可替换成你自己的固定色表）
  const hue = (lane * 47) % 360;
  return `hsl(${hue} 70% 55%)`;
}

function edgePath(x1: number, y1: number, x2: number, y2: number) {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY} ${x2} ${midY} ${x2} ${y2}`;
}

export function GitLikeTimeline({
  commits,
  rowHeight = 44,
  laneGap = 14,
  graphWidth = 88,
}: Props) {
  const { nodes, edges, idToRow, idToLane } = useMemo(
    () => layoutCommits(commits),
    [commits],
  );

  const height = commits.length * rowHeight;
  const paddingX = 18;
  const xOfLane = (lane: number) => paddingX + lane * laneGap;
  const yOfRow = (row: number) => row * rowHeight + rowHeight / 2;

  return (
    <div className="h-[520px] overflow-auto rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="relative flex">
        {/* 左侧图谱列 */}
        <div
          className="sticky left-0 z-10 border-r border-neutral-800 bg-neutral-950"
          style={{ width: graphWidth }}
        >
          <svg
            width={graphWidth}
            height={height}
            className="block"
            style={{ overflow: "visible" }}
          >
            {/* edges */}
            {edges.map((e, idx) => {
              const fromRow = idToRow.get(e.from);
              const toRow = idToRow.get(e.to);
              const fromLane = idToLane.get(e.from);
              const toLane = idToLane.get(e.to);
              if (
                fromRow == null ||
                toRow == null ||
                fromLane == null ||
                toLane == null
              )
                return null;

              const x1 = xOfLane(fromLane);
              const y1 = yOfRow(fromRow);
              const x2 = xOfLane(toLane);
              const y2 = yOfRow(toRow);

              // 线条颜色：用“来源 lane”的颜色（你也可以改成渐变）
              const stroke = laneColor(fromLane);

              return (
                <path
                  key={idx}
                  d={edgePath(x1, y1, x2, y2)}
                  stroke={stroke}
                  strokeWidth={2.2}
                  fill="none"
                  strokeLinecap="round"
                  opacity={0.9}
                />
              );
            })}

            {/* nodes */}
            {nodes.map((n) => {
              const cx = xOfLane(n.lane);
              const cy = yOfRow(n.row);
              const stroke = laneColor(n.lane);
              return (
                <g key={n.id}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill="rgb(10 10 10)"
                    stroke={stroke}
                    strokeWidth={2.2}
                  />
                  <circle cx={cx} cy={cy} r={2.2} fill={stroke} />
                </g>
              );
            })}
          </svg>
        </div>

        {/* 右侧列表列 */}
        <div className="min-w-0 flex-1">
          {commits.map((c) => (
            <div
              key={c.id}
              className="flex items-center border-b border-neutral-900 px-3"
              style={{ height: rowHeight }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-neutral-100">
                  {c.message}
                </div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {c.author ?? "unknown"} {c.date ? `· ${c.date}` : ""}
                </div>
              </div>

              <div className="ml-3 text-xs text-neutral-600">
                {c.id.slice(0, 7)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
