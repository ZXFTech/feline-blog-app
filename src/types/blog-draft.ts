export interface DraftTag {
  content: string;
  color: string;
}
export interface DraftSnapshot {
  title: string;
  content: string;
  tags: DraftTag[];
}
export interface BlogEditorSeed extends DraftSnapshot {
  draftId: string | null;
  blogId: number | null;
  revision: number;
  publishedRevision: number;
  savedAt: string | null;
}
export interface SaveDraftInput extends DraftSnapshot {
  draftId: string;
  blogId: number | null;
  expectedRevision: number;
  saveRequestId: string;
}
export interface SavedDraft {
  draftId: string;
  revision: number;
  publishedRevision: number;
  savedAt: string;
}
export interface PublishDraftInput {
  draftId: string;
  expectedRevision: number;
  publishRequestId: string;
}
export interface PublishedDraft {
  blogId: number;
  publishedRevision: number;
  publicationState: "available" | "deleted";
}
export interface DraftListRow {
  id: string;
  blogId: number | null;
  title: string;
  revision: number;
  savedAt: string;
}
export interface DraftListPage {
  rows: DraftListRow[];
  total: number;
  page: number;
  pageSize: number;
}
