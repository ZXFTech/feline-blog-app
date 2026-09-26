import type { ComponentType } from "react";

export const catalogCategories = [
  { id: "layout", label: "布局与容器", order: 10 },
  { id: "navigation", label: "按钮与导航", order: 20 },
  { id: "forms", label: "表单与输入", order: 30 },
  { id: "feedback", label: "反馈与状态", order: 40 },
  { id: "overlay", label: "浮层与菜单", order: 50 },
  { id: "data", label: "数据展示", order: 60 },
  { id: "business", label: "业务组件", order: 70 },
] as const;

export type CatalogCategoryId = (typeof catalogCategories)[number]["id"];
export interface DemoProps {
  compact?: boolean;
  instanceId?: string;
}

export type DemoLoader = () => Promise<{ default: ComponentType<DemoProps> }>;

export type DemoScenarioDimension = "default" | "size" | "variant" | "state" | "combination";

export interface DemoScenario {
  scenarioId: string;
  label: string;
  dimension: DemoScenarioDimension;
  render: Readonly<DemoProps>;
}

export interface ComponentCapabilities {
  sizes: readonly string[];
  variants: readonly string[];
  states: readonly string[];
  themeComparison: readonly string[];
}

interface CatalogEntryBase {
  slug: string;
  nameZh: string;
  codeName: string;
  description: string;
  useCases: readonly string[];
  importPath: string;
  sourceFiles: readonly string[];
  categoryId: CatalogCategoryId;
  order: number;
  keywords: readonly string[];
  capabilities: ComponentCapabilities;
}

export interface ReadyCatalogEntry extends CatalogEntryBase {
  status: "ready";
  loadDemo: DemoLoader;
  scenarios: readonly DemoScenario[];
}

export interface PendingCatalogEntry extends CatalogEntryBase {
  status: "pending";
  pendingReason: string;
  integrationNeeds: string;
}

export type CatalogEntry = ReadyCatalogEntry | PendingCatalogEntry;

const capability = (
  sizes: readonly string[] = ["默认"],
  variants: readonly string[] = ["默认"],
  states: readonly string[] = ["默认"],
  themeComparison = true
): ComponentCapabilities => ({
  sizes,
  variants,
  states,
  themeComparison: themeComparison ? ["theme-representative"] : [],
});

function scenarioSegment(value: string, index: number): string {
  const segment = value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return segment || String(index + 1);
}

function createDemoScenarios(capabilities: ComponentCapabilities): readonly DemoScenario[] {
  const dimensions = [
    ["size", capabilities.sizes],
    ["variant", capabilities.variants],
    ["state", capabilities.states],
  ] as const;
  const scenarios: DemoScenario[] = [
    {
      scenarioId: "current-matrix",
      label: "当前主题完整矩阵",
      dimension: "default",
      render: {},
    },
  ];

  for (const [dimension, labels] of dimensions) {
    labels.forEach((label, index) => {
      scenarios.push({
        scenarioId: `${dimension}-${scenarioSegment(label, index)}`,
        label,
        dimension,
        render: {},
      });
    });
  }

  if (capabilities.themeComparison.length) {
    scenarios.push({
      scenarioId: "theme-representative",
      label: "四主题代表形态",
      dimension: "combination",
      render: { compact: true },
    });
  }

  return scenarios;
}

const ready = (
  entry: Omit<ReadyCatalogEntry, "status" | "loadDemo" | "scenarios">,
  loadDemo: DemoLoader
): ReadyCatalogEntry => ({
  ...entry,
  status: "ready",
  loadDemo,
  scenarios: createDemoScenarios(entry.capabilities),
});

const pending = (
  entry: Omit<PendingCatalogEntry, "status" | "pendingReason" | "integrationNeeds">,
  pendingReason = "需要业务数据、认证上下文、全局 Portal 或复杂受控状态，不能在展示页伪造完整接入。",
  integrationNeeds = "提供无副作用展示适配器与固定中文 fixture 后转为 ready。"
): PendingCatalogEntry => ({ ...entry, status: "pending", pendingReason, integrationNeeds });

const base = {
  useCases: ["项目界面"],
  keywords: [] as readonly string[],
};

const pendingFamilies: ReadonlyArray<readonly [string, string, string, string, CatalogCategoryId]> =
  [
    [
      "blog",
      "博客组件",
      "Blog / BlogList / RightSideBar",
      "Blog/AdjacentBlogs.tsx|Blog/BlogOperationBar.tsx|Blog/TOC.tsx|BlogList/BlogEditor.tsx|BlogList/blogList.tsx|BlogList/BlogListOperationBar.tsx|BlogList/ListItem.tsx|RightSideBar/BlogEditBar.tsx",
      "business",
    ],
    [
      "daily",
      "日常状态组件",
      "DailyStatus",
      "DailyStatus/DailyOperationBar.tsx|DailyStatus/DailySummary.tsx|DailyStatus/WeeklyView.tsx|DailyStatus/WorkoutCard.tsx|DailyStatus/WorkoutEditor.tsx",
      "business",
    ],
    [
      "pomodoro",
      "番茄钟组件",
      "Pomodoro / Clock",
      "pomodoro/index.tsx|pomodoro/ListItem.tsx|pomodoro/PomodoroGlobalStatus.tsx|pomodoro/PomodoroHistoryPanel.tsx|pomodoro/PomodoroList.tsx|pomodoro/PomodoroOperationPanel.tsx|pomodoro/PomodoroTimer.tsx|pomodoro/PomodoroTitleBridge.tsx|Clock/FlipClock.tsx|Clock/FlipDigit.tsx|Clock/FlipTimer.tsx|PomodoroCalendar/index.tsx",
      "business",
    ],
    [
      "todo",
      "待办组件",
      "Todo",
      "Todo/TodoDatePart.tsx|Todo/TodoEditorBar.tsx|Todo/TodoItem.tsx|Todo/TodoOperationBar.tsx",
      "business",
    ],
    [
      "profile-auth",
      "用户与权限",
      "Profile / Auth",
      "Profile/ProfileCard.tsx|Profile/UserMenu.tsx|Auth/PermissionAccess.tsx|Auth/ProtectedRoute.tsx",
      "business",
    ],
    [
      "editors",
      "编辑器",
      "MarkdownEditor / TagEditor",
      "MarkdownEditor/index.tsx|TagEditor/index.tsx",
      "business",
    ],
    [
      "timeline",
      "时间线",
      "Timeline",
      "Timeline/index.tsx|Timeline/MVP.tsx|Timeline/TimelineCard.tsx",
      "data",
    ],
    [
      "utilities",
      "辅助组件",
      "CopyButton / Floating / ToggleSwitch",
      "CopyButton/copyButton.tsx|Floating/index.tsx|ToggleSwitch/index.tsx|ColorPanel/index.tsx|InfinityScrollBar/index.tsx|TextGap/index.tsx|Portal/index.tsx|component-example.tsx",
      "data",
    ],
    [
      "notion-message",
      "富文本与消息",
      "NotionBlock / Message",
      "NotionBlock/index.tsx|Message/index.tsx",
      "business",
    ],
  ];

export const catalogEntries: readonly CatalogEntry[] = [
  ready(
    {
      ...base,
      slug: "neu-surface",
      nameZh: "拟态表面",
      codeName: "NeuSurface / NeuPanel",
      description: "全站拟态视觉的基础表面与布局容器，统一阴影、圆角、密度和排列方式。",
      useCases: ["页面分区", "信息面板", "组件承载"],
      importPath: "@/components/ui/neu-surface · @/components/ui/neu-panel",
      sourceFiles: ["ui/neu-surface.tsx", "ui/neu-panel.tsx"],
      categoryId: "layout",
      order: 10,
      keywords: ["surface", "panel", "容器", "拟态", "布局"],
      capabilities: capability(
        ["compact", "default", "comfortable"],
        ["raised", "raised-sm", "inset", "inset-sm", "flat"]
      ),
    },
    () => import("@/app/album/_components/demos/FoundationDemo")
  ),
  ready(
    {
      ...base,
      slug: "content-shell",
      nameZh: "页面外壳",
      codeName: "Content / Navbar / Footer",
      description: "集中展示全局导航、页面主区与左右侧栏，以及固定页脚的真实组合关系。",
      useCases: ["应用全局外壳", "主内容布局", "展示区与操作区编排"],
      importPath: "@/components/Content · @/components/Navbar · @/components/Footer",
      sourceFiles: ["Content/index.tsx", "Navbar/index.tsx", "Footer/index.tsx"],
      categoryId: "layout",
      order: 20,
      keywords: ["content", "navbar", "footer", "页面外壳", "导航", "页脚", "侧栏"],
      capabilities: capability(
        ["主区", "双区", "三区"],
        ["Content", "Navbar", "Footer"],
        ["默认", "带页面信息", "带页面操作", "完整外壳"]
      ),
    },
    () => import("@/app/album/_components/demos/ShellDemo")
  ),
  ready(
    {
      ...base,
      slug: "button",
      nameZh: "按钮与链接操作",
      codeName: "Button / ButtonGroup / StyledLink",
      description: "集中展示单按钮、连续按钮组和按钮视觉链接，减少相同样例在目录中重复出现。",
      useCases: ["提交操作", "分段操作", "强调导航"],
      importPath:
        "@/components/ui/button · @/components/ui/button-group · @/components/ui/styled-link",
      sourceFiles: ["ui/button.tsx", "ui/button-group.tsx", "ui/styled-link.tsx"],
      categoryId: "navigation",
      order: 10,
      keywords: ["button", "button group", "styled link", "按钮", "按钮组", "链接", "loading"],
      capabilities: capability(
        ["xs", "sm", "md", "lg", "xl", "icon"],
        ["default", "primary", "danger", "warning", "success", "horizontal", "vertical"],
        ["默认", "禁用", "加载中", "图标", "组合"]
      ),
    },
    () => import("@/app/album/_components/demos/ButtonDemo")
  ),
  ready(
    {
      ...base,
      slug: "input-field",
      nameZh: "输入、复选框与字段",
      codeName: "Input / InputField / Textarea / InputGroup / Checkbox / Field / Label",
      description: "集中展示文本输入、复选框以及带标签、说明和错误信息的字段组合。",
      useCases: ["搜索", "表单字段", "长文本录入", "布尔选项", "字段分组"],
      importPath:
        "@/components/ui/input-field · @/components/ui/checkbox · @/components/ui/field · @/components/ui/label",
      sourceFiles: [
        "ui/input.tsx",
        "ui/input-field.tsx",
        "ui/input-group.tsx",
        "ui/textarea.tsx",
        "ui/checkbox.tsx",
        "ui/field.tsx",
        "ui/label.tsx",
      ],
      categoryId: "forms",
      order: 10,
      keywords: [
        "input",
        "textarea",
        "checkbox",
        "field",
        "label",
        "输入框",
        "复选框",
        "字段",
        "标签",
        "表单",
        "search",
      ],
      capabilities: capability(
        ["sm", "md", "lg", "xl"],
        ["单行", "多行", "前后缀", "unchecked", "checked"],
        ["默认", "禁用", "错误", "可清空", "选中", "未选中"]
      ),
    },
    () => import("@/app/album/_components/demos/FormDemo")
  ),
  ready(
    {
      ...base,
      slug: "select",
      nameZh: "选择器",
      codeName: "Select / Combobox",
      description: "集中展示固定选项选择与可搜索选择，覆盖尺寸、禁用、清空和空结果状态。",
      useCases: ["固定选项选择", "长列表搜索", "表单筛选"],
      importPath: "@/components/ui/select · @/components/ui/combobox",
      sourceFiles: ["ui/select.tsx", "ui/combobox.tsx"],
      categoryId: "forms",
      order: 20,
      keywords: ["select", "combobox", "选择器", "下拉", "搜索选择", "筛选"],
      capabilities: capability(
        ["sm", "default"],
        ["Select", "Combobox", "分组选项", "可搜索"],
        ["占位", "已选择", "禁用", "可清空", "空结果", "打开", "关闭"]
      ),
    },
    () => import("@/app/album/_components/demos/SelectionDemo")
  ),
  ready(
    {
      ...base,
      slug: "dialogs",
      nameZh: "对话框",
      codeName: "Dialog / AlertDialog / Modal",
      description: "集中展示通用对话框、确认对话框与项目现有受控弹窗，所有结果仅写入本地状态。",
      useCases: ["补充信息", "危险操作确认", "带页脚的受控流程"],
      importPath: "@/components/ui/dialog · @/components/ui/alert-dialog · @/components/Modal",
      sourceFiles: ["ui/dialog.tsx", "ui/alert-dialog.tsx", "Modal/index.tsx"],
      categoryId: "overlay",
      order: 10,
      keywords: ["dialog", "alert dialog", "modal", "对话框", "确认", "弹窗", "浮层"],
      capabilities: capability(
        ["sm", "default", "受控宽度"],
        ["Dialog", "AlertDialog", "Modal", "默认页脚", "无页脚"],
        ["关闭", "打开", "取消", "确认", "加载中"]
      ),
    },
    () => import("@/app/album/_components/demos/DialogDemo")
  ),
  ready(
    {
      ...base,
      slug: "menus",
      nameZh: "菜单与气泡",
      codeName: "DropdownMenu / Popover",
      description: "集中展示操作菜单、复选与单选菜单项、子菜单，以及可切换对齐方式的补充信息气泡。",
      useCases: ["上下文操作", "选项切换", "补充说明", "轻量设置"],
      importPath: "@/components/ui/dropdown-menu · @/components/ui/popover",
      sourceFiles: ["ui/dropdown-menu.tsx", "ui/popover.tsx"],
      categoryId: "overlay",
      order: 20,
      keywords: ["dropdown", "menu", "popover", "菜单", "气泡", "浮层", "子菜单"],
      capabilities: capability(
        ["内容自适应", "w-72"],
        ["普通项", "复选项", "单选项", "子菜单", "start", "center", "end"],
        ["关闭", "打开", "选中", "禁用", "键盘导航"]
      ),
    },
    () => import("@/app/album/_components/demos/MenuDemo")
  ),
  ready(
    {
      ...base,
      slug: "feedback-status",
      nameZh: "反馈与状态",
      codeName: "Badge / Tag / ProgressBar / ProMessage / ThemeSwitcher",
      description: "集中展示紧凑状态、进度反馈、全局消息和主题切换，避免相同组合样例重复出现。",
      useCases: ["状态标记", "任务进度", "操作反馈", "主题设置"],
      importPath:
        "@/components/ui/badge · @/components/Tag · @/components/ui/progress-bar · @/components/ProMessage · @/components/theme-switcher",
      sourceFiles: [
        "ui/badge.tsx",
        "Tag/index.tsx",
        "Tag/TagOperator.tsx",
        "Tag/TagShowCase.tsx",
        "ui/progress-bar.tsx",
        "ProMessage/index.tsx",
        "theme-switcher.tsx",
        "theme-provider.tsx",
      ],
      categoryId: "feedback",
      order: 10,
      keywords: [
        "badge",
        "tag",
        "progress",
        "toast",
        "theme",
        "徽章",
        "标签",
        "进度",
        "消息",
        "主题",
      ],
      capabilities: capability(
        ["sm", "md", "lg"],
        ["default", "primary", "danger", "warning", "success", "light", "dark", "sugar", "warm"],
        ["静态", "可选择", "可关闭", "带标签", "交互触发"]
      ),
    },
    () => import("@/app/album/_components/demos/FeedbackDemo")
  ),
  ready(
    {
      ...base,
      slug: "card-data",
      nameZh: "卡片与数据展示",
      codeName: "Card / Separator / Icon",
      description: "用卡片层级、分隔线和图标组织结构化信息。",
      useCases: ["摘要卡片", "详情分区", "辅助视觉"],
      importPath: "@/components/ui/card · @/components/ui/separator · @/components/Icon",
      sourceFiles: ["ui/card.tsx", "ui/separator.tsx", "Icon/index.tsx", "Icon/presetIcon.tsx"],
      categoryId: "data",
      order: 10,
      keywords: ["card", "separator", "icon", "卡片", "图标"],
      capabilities: capability(["default", "sm"], ["卡片", "分隔线", "图标"]),
    },
    () => import("@/app/album/_components/demos/DataDemo")
  ),
  ready(
    {
      ...base,
      slug: "calendar",
      nameZh: "日历",
      codeName: "Calendar",
      description: "用于单日、多日与日期范围选择，支持月份切换、禁用日期、周数和月份下拉。",
      useCases: ["日期选择", "日期范围筛选", "多日计划", "月份浏览"],
      importPath: "@/components/ui/calendar",
      sourceFiles: ["ui/calendar.tsx"],
      categoryId: "data",
      order: 20,
      keywords: ["calendar", "day picker", "日历", "日期", "单选", "多选", "日期范围"],
      capabilities: capability(
        ["固定单月", "自适应宽度"],
        ["single", "multiple", "range", "dropdown", "week number"],
        ["默认", "已选择", "禁用", "隐藏相邻月份", "月份切换"]
      ),
    },
    () => import("@/app/album/_components/demos/CalendarDemo")
  ),
  ready(
    {
      ...base,
      slug: "checklist",
      nameZh: "清单卡片",
      codeName: "ChecklistCard",
      description: "概览清单的完成进度、截止时间和快捷操作，使用固定本地样例安全演示。",
      useCases: ["任务检查", "发布准备", "采购与出行清单"],
      importPath: "@/components/Checklist/ChecklistCard",
      sourceFiles: ["Checklist/ChecklistCard.tsx"],
      categoryId: "business",
      order: 10,
      keywords: ["checklist", "checklist card", "清单", "清单卡片", "进度", "截止时间"],
      capabilities: capability(
        ["sm", "md", "lg"],
        ["未完成", "部分完成", "全部完成", "已过期"],
        ["默认", "查看详情", "编辑", "删除", "恢复"]
      ),
    },
    () => import("@/app/album/_components/demos/ChecklistCardDemo")
  ),
  ready(
    {
      ...base,
      slug: "checklist-workflows",
      nameZh: "清单项、表单与详情",
      codeName:
        "ChecklistItemCard / ChecklistForm / ChecklistDetailDialog / ChecklistItemDetailDialog / ChecklistItemEditDialog",
      description:
        "展示卡片管理按钮显隐、方框状态图标、主题化小时分钟选择及短屏表单滚动，全部操作使用本地沙盒状态。",
      useCases: ["清单项确认", "创建与编辑清单", "查看清单及清单项详情"],
      importPath:
        "@/components/Checklist/ChecklistItemCard · @/components/Checklist/ChecklistForm · @/components/Checklist/ChecklistDetailDialog · @/components/Checklist/ChecklistItemDetailDialog · @/components/Checklist/ChecklistItemEditDialog",
      sourceFiles: [
        "Checklist/ChecklistItemCard.tsx",
        "Checklist/ChecklistForm.tsx",
        "Checklist/ChecklistDetailDialog.tsx",
        "Checklist/ChecklistItemDetailDialog.tsx",
        "Checklist/ChecklistItemEditDialog.tsx",
        "ui/kbd.tsx",
        "Checklist/ChecklistItemTrashDialog.tsx",
        "Checklist/ChecklistDetailView.tsx",
        "Checklist/ChecklistFormScreen.tsx",
        "Checklist/ChecklistListFilters.tsx",
        "Checklist/ChecklistTrashView.tsx",
        "Checklist/ChecklistVirtualGrid.tsx",
      ],
      categoryId: "business",
      order: 20,
      keywords: [
        "checklist item",
        "checklist form",
        "checklist detail",
        "清单项",
        "清单表单",
        "清单详情",
        "弹窗",
      ],
      capabilities: capability(
        ["sm", "md", "lg"],
        ["创建", "编辑", "清单详情", "清单项详情"],
        ["未确认", "已确认", "更新中", "提交成功", "提交失败", "删除", "恢复"]
      ),
    },
    () => import("@/app/album/_components/demos/ChecklistWorkflowDemo")
  ),
  ...pendingFamilies.map(([slug, nameZh, codeName, files, categoryId], index) =>
    pending({
      ...base,
      slug,
      nameZh,
      codeName,
      description: "该组件家族已纳入目录，等待隔离业务依赖后提供安全的交互演示。",
      importPath: `@/components/${codeName.split(" / ")[0]}`,
      sourceFiles: files.split("|"),
      categoryId,
      order: 100 + index,
      keywords: [slug, nameZh, codeName],
      capabilities: capability(["按生产契约"], ["按生产契约"], ["待接入"], false),
    })
  ),
];

export const excludedComponentSources = [
  "Logo/svg/index.ts",
  "Media/soundManager.ts",
  "ProMessage/assets.tsx",
  "ProMessage/hooks.tsx",
  "ProMessage/state.ts",
  "ProMessage/types.ts",
  "Timeline/mockData.ts",
  "Timeline/utils.ts",
] as const;

export function getCatalogEntry(
  slug: string | null,
  entries: readonly CatalogEntry[] = catalogEntries
): CatalogEntry | undefined {
  const aliases: Record<string, string> = {
    "button-group": "button",
    "checkbox-field": "input-field",
    "badge-tag": "feedback-status",
    "progress-toast": "feedback-status",
    "theme-switcher": "feedback-status",
  };
  const resolvedSlug = slug ? (aliases[slug] ?? slug) : slug;
  return entries.find((entry) => entry.slug === resolvedSlug);
}

export function searchCatalog(
  query: string,
  entries: readonly CatalogEntry[] = catalogEntries
): readonly CatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return entries;

  return entries.filter((entry) => {
    const category = catalogCategories.find((item) => item.id === entry.categoryId)?.label ?? "";
    return [entry.nameZh, entry.codeName, entry.importPath, category, ...entry.keywords].some(
      (value) => value.toLocaleLowerCase().includes(normalized)
    );
  });
}

export function sortCatalogEntries(entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
  return [...entries].sort((left, right) => left.order - right.order);
}
