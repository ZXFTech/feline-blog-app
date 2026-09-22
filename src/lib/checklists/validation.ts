import { THEME_COLOR_OPTIONS } from "@/lib/checklists/constants";
import type {
  ChecklistConfirmationFilter,
  ChecklistExpiryFilter,
  ChecklistItemInput,
  ChecklistListInput,
  ChecklistWriteInput,
} from "@/types/checklist";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const themes = new Set<string>(THEME_COLOR_OPTIONS.map((option) => option.value));
const expiryValues = new Set<ChecklistExpiryFilter>(["active", "expired"]);
const confirmationValues = new Set<ChecklistConfirmationFilter>([
  "all",
  "confirmed",
  "partial",
  "unconfirmed",
]);

export function normalizeText(value: unknown, max: number, allowEmpty = false) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().normalize("NFC");
  const length = Array.from(normalized).length;
  if ((!allowEmpty && length === 0) || length > max) return null;
  return normalized;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function offsetAt(instant: number, timeZone: string) {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    year: "numeric",
  })
    .formatToParts(new Date(instant))
    .find((candidate) => candidate.type === "timeZoneName")?.value;
  if (part === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(part ?? "");
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === "+" ? 1 : -1) * minutes * 60_000;
}

function localParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Resolve a minute-precision wall-clock value in an IANA zone. Ambiguous values use the earlier instant. */
export function resolveLocalDateTime(value: string, timeZone: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const check = new Date(naive);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  )
    return null;

  try {
    const offsets = new Set<number>();
    for (const probe of [naive - 172_800_000, naive, naive + 172_800_000]) {
      const offset = offsetAt(probe, timeZone);
      if (offset === null) return null;
      offsets.add(offset);
    }
    const expected = [yearText, monthText, dayText, hourText, minuteText].join(":");
    const candidates = [...offsets]
      .map((offset) => naive - offset)
      .filter((instant) => {
        const actual = localParts(instant, timeZone);
        return (
          [actual.year, actual.month, actual.day, actual.hour, actual.minute].join(":") === expected
        );
      })
      .sort((left, right) => left - right);
    return candidates.length ? new Date(candidates[0]) : null;
  } catch {
    return null;
  }
}

export function parseChecklistWriteInput(
  input: ChecklistWriteInput,
  now = new Date(),
  requireFuture = true
) {
  const fields: Record<string, string> = {};
  const name = normalizeText(input?.name, 100);
  if (name === null) fields.name = "清单名需为 1 到 100 个字符";
  if (!themes.has(input?.themeColor)) fields.themeColor = "请选择有效的主题色";
  if (typeof input?.timeZone !== "string" || input.timeZone.length > 100) {
    fields.expiresAt = "浏览器时区无效";
  } else {
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: input.timeZone }).format(now);
    } catch {
      fields.expiresAt = "浏览器时区无效";
    }
  }
  const expiresAt = resolveLocalDateTime(input?.localDateTime ?? "", input?.timeZone ?? "");
  if (!expiresAt || !Number.isFinite(expiresAt.getTime())) {
    fields.expiresAt = "截止时间必须是该时区中存在的分钟精度本地时间";
  } else if (requireFuture && expiresAt <= now) {
    fields.expiresAt = "截止时间必须晚于当前时间";
  }
  if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 200) {
    fields.items = "清单需包含 1 到 200 个项目";
  }
  const parsedItems: ChecklistItemInput[] = [];
  for (const [index, item] of (input?.items ?? []).entries()) {
    const detail = normalizeText(item?.detail, 2000);
    if (detail === null) fields[`items.${index}.detail`] = "项目详情需为 1 到 2000 个字符";
    if (detail !== null) {
      parsedItems.push({
        ...(item.id ? { id: item.id } : {}),
        ...(item.revision ? { revision: item.revision } : {}),
        detail,
      });
    }
  }
  return Object.keys(fields).length
    ? { ok: false as const, fields }
    : {
        ok: true as const,
        value: {
          name: name!,
          themeColor: input.themeColor,
          expiresAt: expiresAt!,
          localDateTime: input.localDateTime,
          timeZone: input.timeZone,
          items: parsedItems,
        },
      };
}

export function parseChecklistListInput(input: ChecklistListInput) {
  const expiry = input.expiry ?? "active";
  const confirmation = input.confirmation ?? "all";
  const q = normalizeText(input.q ?? "", 100, true);
  if (!expiryValues.has(expiry) || !confirmationValues.has(confirmation) || q === null) return null;
  return { expiry, confirmation, q, cursor: input.cursor || null };
}
