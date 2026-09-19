"use client";

import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

import type { DemoProps } from "@/app/album/_components/catalog";
import { ComponentDemoGroup, DemoSection } from "@/app/album/_components/demos/DemoSection";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";

const INITIAL_MONTH = new Date(2026, 8, 1);
const FIXED_TODAY = new Date(2026, 8, 19);
const INITIAL_SINGLE = new Date(2026, 8, 18);
const INITIAL_MULTIPLE = [new Date(2026, 8, 8), new Date(2026, 8, 12), new Date(2026, 8, 22)];
const INITIAL_RANGE: DateRange = {
  from: new Date(2026, 8, 14),
  to: new Date(2026, 8, 18),
};
const FIXED_DISABLED_DATES = [new Date(2026, 8, 9), new Date(2026, 8, 23)];

function formatDate(date: Date | undefined) {
  return date ? format(date, "yyyy-MM-dd") : "未选择";
}

function getWeekendDates(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const cursor = new Date(year, monthIndex, 1);
  const dates: Date[] = [];

  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === 0 || cursor.getDay() === 6) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function DisabledDatesNotice({ dates }: { dates: readonly Date[] }) {
  return (
    <p
      role="note"
      className="max-w-xs rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground"
    >
      日历包含禁用日期：{dates.map((date) => formatDate(date)).join("、")}
    </p>
  );
}

function CalendarScenario({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="min-w-fit space-y-3" aria-label={title} data-testid={testId}>
      <div className="space-y-1">
        <h5 className="text-sm font-semibold text-foreground">{title}</h5>
        <p className="max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function CalendarDemo({ compact = false }: DemoProps) {
  const [month, setMonth] = useState(INITIAL_MONTH);
  const [single, setSingle] = useState<Date | undefined>(INITIAL_SINGLE);
  const [multiple, setMultiple] = useState<Date[] | undefined>(INITIAL_MULTIPLE);
  const [range, setRange] = useState<DateRange | undefined>(INITIAL_RANGE);
  const [dropdownSelected, setDropdownSelected] = useState<Date | undefined>(INITIAL_SINGLE);

  const reset = () => {
    setMonth(INITIAL_MONTH);
    setSingle(INITIAL_SINGLE);
    setMultiple(INITIAL_MULTIPLE);
    setRange(INITIAL_RANGE);
    setDropdownSelected(INITIAL_SINGLE);
  };

  if (compact) {
    return (
      <div className="overflow-x-auto">
        <Calendar
          mode="single"
          month={INITIAL_MONTH}
          selected={INITIAL_SINGLE}
          today={FIXED_TODAY}
          locale={zhCN}
        />
      </div>
    );
  }

  const disabledWeekendDates = getWeekendDates(month);

  return (
    <div className="space-y-10">
      <ComponentDemoGroup
        title="1. 单选日历 Calendar"
        description="选择一个日期并浏览月份。示例固定在 2026 年 9 月，避免真实时间和用户数据影响展示。"
      >
        <DemoSection nested title="默认、选中与禁用状态">
          <CalendarScenario
            title="交互单选"
            description="周末不可选择，切换月份和日期只修改当前演示的本地状态。"
            testId="calendar-single-sandbox"
          >
            <Calendar
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={single}
              onSelect={setSingle}
              disabled={{ dayOfWeek: [0, 6] }}
              today={FIXED_TODAY}
              locale={zhCN}
            />
            <DisabledDatesNotice dates={disabledWeekendDates} />
            <p aria-live="polite" className="text-sm text-muted-foreground">
              单选日期：{formatDate(single)}
            </p>
          </CalendarScenario>

          <CalendarScenario
            title="隐藏相邻月份"
            description="保持单月边界清晰，同时展示今天、已选择和不可用日期。"
          >
            <Calendar
              mode="single"
              month={INITIAL_MONTH}
              selected={FIXED_TODAY}
              disabled={FIXED_DISABLED_DATES}
              showOutsideDays={false}
              today={FIXED_TODAY}
              locale={zhCN}
            />
            <DisabledDatesNotice dates={FIXED_DISABLED_DATES} />
          </CalendarScenario>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="2. 多选与范围 Calendar"
        description="沿用组件真实的 multiple 与 range 模式，展示离散日期和连续日期区间。"
      >
        <DemoSection nested title="选择模式">
          <CalendarScenario title="多日选择" description="适合排期、值班和批量日期标记。">
            <Calendar
              mode="multiple"
              month={INITIAL_MONTH}
              selected={multiple}
              onSelect={setMultiple}
              today={FIXED_TODAY}
              locale={zhCN}
            />
            <p aria-live="polite" className="text-sm text-muted-foreground">
              已选择 {multiple?.length ?? 0} 天
            </p>
          </CalendarScenario>

          <CalendarScenario
            title="日期范围"
            description="范围起点、区间和终点使用组件自身状态样式。"
          >
            <Calendar
              mode="range"
              month={INITIAL_MONTH}
              selected={range}
              onSelect={setRange}
              today={FIXED_TODAY}
              locale={zhCN}
            />
            <p aria-live="polite" className="text-sm text-muted-foreground">
              日期范围：{formatDate(range?.from)} 至 {formatDate(range?.to)}
            </p>
          </CalendarScenario>
        </DemoSection>
      </ComponentDemoGroup>

      <ComponentDemoGroup
        title="3. 月份导航 Calendar"
        description="展示月份和年份下拉、周数，以及受固定起止月份约束的导航能力。"
      >
        <DemoSection nested title="下拉标题与周数">
          <CalendarScenario
            title="月份与年份下拉"
            description="可在 2026 年内快速跳转，并在每周开头显示周数。"
          >
            <Calendar
              mode="single"
              defaultMonth={INITIAL_MONTH}
              selected={dropdownSelected}
              onSelect={setDropdownSelected}
              captionLayout="dropdown"
              startMonth={new Date(2026, 0, 1)}
              endMonth={new Date(2026, 11, 1)}
              showWeekNumber
              today={FIXED_TODAY}
              locale={zhCN}
            />
          </CalendarScenario>
          <Button
            type="button"
            aria-label="恢复日历样例"
            materialIcon="restart_alt"
            onClick={reset}
          >
            恢复日历样例
          </Button>
        </DemoSection>
      </ComponentDemoGroup>
    </div>
  );
}
