export const mockTimelineData: timelineData[] = [
  {
    date: new Date("2025-08-12T10:00:00"),
    title: "项目 Kickoff / 需求对齐",
    detail:
      "确认里程碑、交付范围与风险点；确定第一版 MVP 的功能集合与验收标准。",
    partner: [
      { name: "Alice (PM)", avatar: "https://i.pravatar.cc/120?img=1" },
      { name: "Bo (Design)", avatar: "https://i.pravatar.cc/120?img=2" },
    ],
    storyline: "Product",
  },
  {
    date: new Date("2025-08-16T15:30:00"),
    title: "信息架构与交互走查",
    detail:
      "输出页面 IA、关键流程图与交互稿；确认空状态/异常状态/加载态处理策略。",
    partner: [{ name: "Chen (FE)", avatar: "https://i.pravatar.cc/120?img=3" }],
    storyline: "Design",
  },
  {
    date: new Date("2025-08-22T09:00:00"),
    title: "技术方案评审：时间线组件架构",
    detail:
      "确定内部滚动容器、sticky takeover、lane 固定映射、todo 虚线样式实现路径。",
    partner: [
      { name: "Dana (FE)", avatar: "https://i.pravatar.cc/120?img=4" },
      { name: "Evan (Tech Lead)", avatar: "https://i.pravatar.cc/120?img=5" },
    ],
    storyline: "Engineering",
  },
  {
    date: new Date("2025-09-02T14:00:00"),
    title: "组件 V1：基础渲染与样式落地",
    detail:
      "完成节点/连线渲染、主题颜色映射、概览模式布局；接入 demo 数据与交互。",
    partner: [{ name: "Fay (FE)", avatar: "https://i.pravatar.cc/120?img=6" }],
    storyline: "Engineering",
  },
  {
    date: new Date("2025-09-10T11:00:00"),
    title: "组件 V1.1：详情模式与可访问性",
    detail: "完善 theme 模式字段展示；补齐键盘可用性、可读性与 aria 标记。",
    partner: [
      { name: "Han (QA)", avatar: "https://i.pravatar.cc/120?img=7" },
      { name: "Iris (FE)", avatar: "https://i.pravatar.cc/120?img=8" },
    ],
    storyline: "Quality",
  },
  {
    date: new Date("2025-09-18T16:20:00"),
    title: "联调：接口字段与 meta 扩展",
    detail: "对齐接口的时间戳格式与字段可选性；补充 meta 显示与容错策略。",
    partner: [{ name: "Jack (BE)", avatar: "https://i.pravatar.cc/120?img=9" }],
    storyline: "Integration",
  },
  {
    date: new Date("2025-10-01T10:30:00"),
    title: "上线前回归与性能优化",
    detail: "减少重渲染、优化滚动性能；确认图片懒加载与长列表表现稳定。",
    partner: [
      { name: "Kimi (FE)", avatar: "https://i.pravatar.cc/120?img=10" },
      { name: "Luna (QA)", avatar: "https://i.pravatar.cc/120?img=11" },
    ],
    storyline: "Release",
  },
  {
    date: new Date("2025-10-08T09:45:00"),
    title: "发布：Timeline 组件 MVP",
    detail: "完成 MVP 上线；监控埋点与错误告警；收集用户反馈进入下一轮迭代。",
    partner: [{ name: "Mia (PM)", avatar: "https://i.pravatar.cc/120?img=12" }],
    storyline: "Release",
  },
  {
    date: new Date("2025-10-11T19:32:00"),
    title: "时间线结尾",
    detail: "时间线结尾内容：一二三，三二一，一二三四五六七，七六五四三二一",
    partner: [{ name: "Mia (PM)", avatar: "https://i.pravatar.cc/120?img=12" }],
    storyline: "Release",
  },
];

export interface Partner {
  name: string;
  avatar: string;
}

export interface timelineData {
  date: Date;
  title: string;
  detail?: string;
  partner?: Partner[];
  storyline: string; // ✅ 必填
}

interface Props {
  timelineData: timelineData[];
}

/**
 * 生成 100 条 timelineData 示例数据（storyline 必填 + 日期随机分布）
 * - date：在一个时间窗口内随机分布（默认 2025-01-01 ~ 2026-01-01）
 * - storyline：始终有值（必填）
 * - detail/partner：仍保留可选字段覆盖场景
 * - 结果：按 date 升序排序（便于时间线展示）
 */
export const getMockTimelineData = (
  startDate: Date,
  endDate: Date,
  length: number,
): timelineData[] => {
  // 随机日期分布窗口（你可按需改）
  const start = startDate.getTime();
  const end = endDate.getTime();

  const storylines = [
    "Product",
    "Engineering",
    "Design",
    "Growth",
    "QA",
    "Ops",
  ] as const;

  const titleTemplates = [
    "需求对齐与范围确认",
    "方案评审与技术选型",
    "原型/交互走查",
    "开发迭代：功能实现",
    "联调：接口与数据对齐",
    "测试回归与缺陷修复",
    "性能优化与稳定性加固",
    "灰度发布与监控",
    "复盘与下一步规划",
    "里程碑验收",
  ];

  const partnerNames = [
    "Alice",
    "Bo",
    "Chen",
    "Dana",
    "Evan",
    "Fay",
    "Han",
    "Iris",
    "Jack",
    "Kimi",
    "Luna",
    "Mia",
    "Noah",
    "Owen",
    "Pia",
    "Quinn",
    "Rita",
    "Sean",
    "Tina",
    "Uma",
  ];

  const makePartner = (idx: number): Partner => ({
    name: partnerNames[idx % partnerNames.length],
    avatar: `https://i.pravatar.cc/120?img=${(idx % 70) + 1}`,
  });

  const randInt = (min: number, max: number) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  const randTime = () => {
    // 在 [start, end) 内随机毫秒
    const t = start + Math.floor(Math.random() * (end - start));
    return new Date(t);
  };

  const data: timelineData[] = Array.from({ length }).map((_, i) => {
    const title = `#${String(i + 1).padStart(3, "0")} · ${titleTemplates[i % titleTemplates.length]}`;

    // detail：大多数有，少部分缺省
    const detail =
      i % 9 === 0
        ? undefined
        : `这是第 ${i + 1} 条时间点的详细说明，用于演示随机日期排序与可选字段渲染（索引=${i}）。`;

    // storyline：✅ 必填
    const storyline = storylines[i % storylines.length];

    // partner：约 75% 有（1~3 个），其余缺省
    let partner: Partner[] | undefined = undefined;
    if (i % 4 !== 0) {
      const count = randInt(1, 3);
      partner = Array.from({ length: count }).map((_, k) => makePartner(i + k));
    }

    return {
      date: randTime(),
      title,
      detail,
      partner,
      storyline,
    };
  });

  // 时间线常见需要按时间排序：升序（若你要降序可改）
  data.sort((a, b) => a.date.getTime() - b.date.getTime());

  return data;
};
