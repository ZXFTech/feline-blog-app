import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChecklistConfirmationFilter, ChecklistExpiryFilter } from "@/types/checklist";

const CURSOR_TTL_MS = 30 * 60 * 1000;

export interface ChecklistCursorPayload {
  v: 1;
  kind: "list" | "trash" | "item-trash";
  ownerId: string;
  expires: number;
  asOf: string;
  expiry: ChecklistExpiryFilter;
  confirmation: ChecklistConfirmationFilter;
  q: string;
  orderAt: string;
  id: string;
  parentId?: string;
}

function secret() {
  const value = process.env.CHECKLIST_CURSOR_SECRET;
  if (!value || value.length < 32) throw new Error("CHECKLIST_CURSOR_SECRET is not configured");
  return value;
}

function signature(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function signChecklistCursor(
  payload: Omit<ChecklistCursorPayload, "v" | "expires">
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, v: 1, expires: Date.now() + CURSOR_TTL_MS })
  ).toString("base64url");
  return `${body}.${signature(body)}`;
}

export function readChecklistCursor(token: string): ChecklistCursorPayload | null {
  try {
    const [body, supplied] = token.split(".");
    if (!body || !supplied) return null;
    const expected = signature(body);
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    )
      return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload?.v === 1 && payload.expires > Date.now()
      ? (payload as ChecklistCursorPayload)
      : null;
  } catch {
    return null;
  }
}
