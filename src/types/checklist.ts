export type ChecklistExpiryFilter = "active" | "expired";
export type ChecklistConfirmationFilter = "all" | "confirmed" | "partial" | "unconfirmed";

export interface ChecklistItemView {
  id: string;
  detail: string;
  confirmedAt: string | null;
  createdOrder: number;
  revision: number;
}

export interface ChecklistListItem {
  id: string;
  name: string;
  themeColor: string;
  expiresAt: string;
  expiryState: ChecklistExpiryFilter;
  confirmationState: Exclude<ChecklistConfirmationFilter, "all">;
  itemCount: number;
  confirmedCount: number;
  revision: number;
}

export interface ChecklistDetail extends ChecklistListItem {
  items: ChecklistItemView[];
  serverNow: string;
}

export interface ChecklistListInput {
  expiry?: ChecklistExpiryFilter;
  confirmation?: ChecklistConfirmationFilter;
  q?: string;
  cursor?: string;
}

export interface ChecklistListResult {
  items: ChecklistListItem[];
  nextCursor: string | null;
  asOf: string;
  serverNow: string;
}

export interface ChecklistItemInput {
  id?: string;
  revision?: number;
  detail: string;
}

export interface ChecklistWriteInput {
  name: string;
  themeColor: string;
  localDateTime: string;
  timeZone: string;
  items: ChecklistItemInput[];
}

export interface CreateChecklistInput extends ChecklistWriteInput {
  createRequestId: string;
}

export interface UpdateChecklistInput extends ChecklistWriteInput {
  id: string;
  revision: number;
}

export interface ChecklistTrashItem {
  id: string;
  name: string;
  deletedAt: string;
  recoverableUntil: string;
  revision: number;
}

export interface ChecklistItemTrashItem {
  id: string;
  checklistId: string;
  parentRevision: number;
  detail: string;
  deletedAt: string;
  recoverableUntil: string;
  revision: number;
}

export interface ChecklistTrashResult {
  items: ChecklistTrashItem[];
  nextCursor: string | null;
  serverNow: string;
}

export interface ChecklistItemTrashResult {
  items: ChecklistItemTrashItem[];
  nextCursor: string | null;
  serverNow: string;
}
