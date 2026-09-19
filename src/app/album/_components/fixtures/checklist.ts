import type { Checklist } from "@/lib/checklist";
import type { ChecklistFormValues } from "@/components/Checklist/ChecklistForm";

// Derived once per module load so the countdown stays meaningful without reading business data.
const futureDeadline = new Date();
futureDeadline.setDate(futureDeadline.getDate() + 7);
futureDeadline.setHours(18, 0, 0, 0);
const FUTURE_DEADLINE = futureDeadline.getTime();

const expiredDeadline = new Date();
expiredDeadline.setDate(expiredDeadline.getDate() - 1);
expiredDeadline.setHours(9, 0, 0, 0);
const EXPIRED_DEADLINE = expiredDeadline.getTime();

export const checklistFixtures = {
  unconfirmed: {
    id: "album-checklist-unconfirmed",
    name: "旅行出发检查",
    themeColor: "var(--muted-foreground)",
    expiresAt: FUTURE_DEADLINE,
    items: [
      { id: "passport", label: "检查证件", detail: "确认有效期与签证信息", done: false },
      { id: "charger", label: "携带充电器", detail: "手机与相机充电器", done: false },
    ],
  },
  partial: {
    id: "album-checklist-partial",
    name: "版本发布检查",
    themeColor: "var(--primary)",
    expiresAt: FUTURE_DEADLINE,
    items: [
      { id: "review", label: "完成代码审查", detail: "关键改动已由同伴复核", done: true },
      { id: "regression", label: "执行回归测试", detail: "覆盖登录与发布流程", done: false },
      { id: "notes", label: "整理发布说明", detail: "记录用户可见变化", done: false },
    ],
  },
  confirmed: {
    id: "album-checklist-confirmed",
    name: "周末采购清单",
    themeColor: "var(--status-success)",
    expiresAt: FUTURE_DEADLINE,
    items: [
      { id: "fruit", label: "水果", detail: "苹果和橙子", done: true },
      { id: "milk", label: "牛奶", detail: "两盒常温牛奶", done: true },
    ],
  },
  expired: {
    id: "album-checklist-expired",
    name: "旧活动准备清单",
    themeColor: "var(--status-warning)",
    expiresAt: EXPIRED_DEADLINE,
    items: [{ id: "venue", label: "确认场地", detail: "历史样例", done: false }],
  },
} as const satisfies Record<string, Checklist>;

export type ChecklistFixtureKey = keyof typeof checklistFixtures;

export const checklistFormFixtures = {
  create: {
    name: "新版本发布准备",
    themeColor: "#20c997",
    expiresAt: { kind: "none", localDateTime: "" },
    items: [
      {
        kind: "new",
        clientKey: "album-new-review",
        name: "确认变更范围",
        detail: "核对本次发布包含的功能与修复",
      },
    ],
  },
  edit: {
    name: "版本发布检查",
    themeColor: "#0d6efd",
    expiresAt: { kind: "datetime", localDateTime: "2026-09-25T18:00" },
    items: [
      {
        kind: "existing",
        itemId: "review",
        expectedRevision: 3,
        clientKey: "album-existing-review",
        name: "完成代码审查",
        detail: "关键改动已由同伴复核",
      },
      {
        kind: "existing",
        itemId: "regression",
        expectedRevision: 2,
        clientKey: "album-existing-regression",
        name: "执行回归测试",
        detail: "覆盖登录与发布流程",
      },
    ],
  },
} as const satisfies Record<"create" | "edit", ChecklistFormValues>;
