export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** 清单项详情描述（清单项卡片第三行展示） */
  detail?: string;
}

export interface Checklist {
  id: string;
  /** 清单名 */
  name: string;
  /** 卡片顶部窄条使用的主题色 */
  themeColor: string;
  /** 有效期截止时间戳（用于倒计时） */
  expiresAt: number;
  items: ChecklistItem[];
}

export function getProgress(list: Pick<Checklist, "items">) {
  const total = list.items.length;
  const done = list.items.filter((i) => i.done).length;
  const ratio = total > 0 ? done / total : 0;
  return { total, done, ratio };
}

export type ChecklistState = "confirmed" | "partial" | "unconfirmed";

export function getChecklistState(done: number, total: number): ChecklistState {
  if (total > 0 && done >= total) return "confirmed";
  if (done <= 0) return "unconfirmed";
  return "partial";
}

/** 橙 → 绿 之间按比例插值：比例越接近 1 越绿，越接近 0 越橙（高饱和度） */
const STATUS_ORANGE = "#ff7300";
const STATUS_GREEN = "#00c62e";

export function ratioColor(ratio: number): string {
  const t = Math.min(1, Math.max(0, ratio));
  const a = parseInt(STATUS_ORANGE.slice(1), 16);
  const b = parseInt(STATUS_GREEN.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r} ${g} ${bl})`;
}

export interface Countdown {
  expired: boolean;
  /** 展示文本，如 "> 1d" / "> 6h" / "45m" / "已过期" */
  label: string;
  /** 是否在时间前展示红色感叹号（过期时为 false） */
  showAlert: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 倒计时格式化：仅展示最大单位。
 * - 已过期 → "已过期"（无感叹号）
 * - >= 1 天 → "> Nd"
 * - >= 1 小时 → "> Nh"
 * - < 1 小时 → "Nm"（无大于号）
 * 非过期状态时间前均带红色感叹号。
 */
export function getCountdown(expiresAt: number, now: number = Date.now()): Countdown {
  const diff = expiresAt - now;
  if (diff <= 0) return { expired: true, label: "已过期", showAlert: false };
  if (diff >= DAY)
    return { expired: false, label: `> ${Math.floor(diff / DAY)}d`, showAlert: false };
  if (diff >= HOUR)
    return { expired: false, label: `> ${Math.floor(diff / HOUR)}h`, showAlert: false };
  // 不足一小时才提示（红色感叹号）
  return { expired: false, label: `${Math.max(1, Math.floor(diff / MINUTE))}m`, showAlert: true };
}

/** 截止日期格式化为 "YYYY-MM-DD HH:mm" */
export function formatDeadline(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
