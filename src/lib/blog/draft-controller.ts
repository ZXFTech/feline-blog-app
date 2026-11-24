import type { ActionFailure, ActionResult } from "@/lib/server/actionResult";
import { draftSaveFitsRequest } from "@/lib/blog/draft-request";
import type {
  BlogEditorSeed,
  DraftSnapshot,
  PublishedDraft,
  PublishDraftInput,
  SavedDraft,
  SaveDraftInput,
} from "@/types/blog-draft";

export interface DraftAdapter {
  save(input: SaveDraftInput): Promise<ActionResult<SavedDraft>>;
  publish(input: PublishDraftInput): Promise<ActionResult<PublishedDraft>>;
  load(draftId: string, blogId: number | null): Promise<ActionResult<BlogEditorSeed>>;
  onSaved?(draftId: string): void;
}
export interface EditorState {
  snapshot: DraftSnapshot;
  draftId: string;
  blogId: number | null;
  revision: number;
  publishedRevision: number;
  savedAt: string | null;
  phase: "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";
  failure: ActionFailure | null;
  publication: "idle" | "saving" | "publishing" | "unknown" | "success";
  result: PublishedDraft | null;
  composing: boolean;
  loadingLatest: boolean;
}
const snapshotOf = (value: DraftSnapshot): DraftSnapshot => ({
  title: value.title,
  content: value.content,
  tags: value.tags.map(({ content, color }) => ({ content, color })),
});
const same = (a: DraftSnapshot, b: DraftSnapshot) => JSON.stringify(a) === JSON.stringify(b);
const transportFailure: ActionFailure = {
  status: "temporary_failure",
  message: "无法确认保存结果，请检查网络后重试。输入仍保留在本页。",
};

// Owns one editing session. No production imports, also used by Album's memory adapter.
export class DraftController {
  readonly sessionId = crypto.randomUUID();
  private state: EditorState;
  private confirmed: DraftSnapshot;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dueAt = 0;
  private pending: SaveDraftInput | null = null;
  private inflight: Promise<boolean> | null = null;
  private publishInput: PublishDraftInput | null = null;
  private confirming = false;
  private active = true;
  private generation = 0;

  constructor(
    seed: BlogEditorSeed,
    private adapter: DraftAdapter
  ) {
    this.confirmed = snapshotOf(seed);
    this.state = {
      snapshot: snapshotOf(seed),
      draftId: seed.draftId ?? crypto.randomUUID(),
      blogId: seed.blogId,
      revision: seed.revision,
      publishedRevision: seed.publishedRevision,
      savedAt: seed.savedAt,
      phase: seed.revision ? "saved" : "idle",
      failure: null,
      publication: "idle",
      result: null,
      composing: false,
      loadingLatest: false,
    };
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private patch(patch: Partial<EditorState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  isDirty = () => !!this.pending || !same(this.state.snapshot, this.confirmed);
  isFrozen = () => this.state.publication !== "idle" || this.state.loadingLatest;
  update(patch: Partial<DraftSnapshot>) {
    if (!this.active || this.isFrozen()) return;
    const snapshot = snapshotOf({ ...this.state.snapshot, ...patch });
    this.patch({
      snapshot,
      phase: this.state.failure
        ? this.state.phase
        : this.inflight
          ? "saving"
          : same(snapshot, this.confirmed)
            ? this.state.revision
              ? "saved"
              : "idle"
            : "dirty",
    });
    this.dueAt = Date.now() + 1000;
    this.schedule();
  }
  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  private schedule() {
    this.clearTimer();
    if (
      !this.active ||
      this.state.composing ||
      this.state.failure ||
      this.isFrozen() ||
      !this.isDirty()
    )
      return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (!this.inflight) void this.saveOne();
      },
      Math.max(0, this.dueAt - Date.now())
    );
  }
  setComposing(composing: boolean) {
    this.patch({ composing });
    this.dueAt = Date.now() + 1000;
    this.schedule();
  }
  private saveOne(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    const generation = this.generation;
    const input = this.pending ?? {
      ...snapshotOf(this.state.snapshot),
      draftId: this.state.draftId,
      blogId: this.state.blogId,
      expectedRevision: this.state.revision,
      saveRequestId: crypto.randomUUID(),
    };
    if (!draftSaveFitsRequest(input)) {
      this.patch({
        phase: "failed",
        failure: {
          status: "invalid_input",
          message: "草稿请求超过 1 MB，请缩短正文或减少标签后重试保存。输入仍保留在本页。",
        },
      });
      return Promise.resolve(false);
    }
    this.pending = input;
    this.patch({ phase: "saving", failure: null });
    // Defer the adapter invocation so inflight is installed before any response.
    const operation = Promise.resolve()
      .then(async () => {
        let result: ActionResult<SavedDraft>;
        try {
          result = await this.adapter.save(input);
        } catch {
          result = transportFailure;
        }
        if (!this.active || generation !== this.generation) return false;
        if (result.status !== "success") {
          if (result.status !== "temporary_failure") this.pending = null;
          this.patch({
            phase:
              result.status === "conflict" || result.status === "not_found" ? "conflict" : "failed",
            failure: result,
          });
          return false;
        }
        this.pending = null;
        this.confirmed = snapshotOf(input);
        this.patch({
          revision: result.data.revision,
          publishedRevision: result.data.publishedRevision,
          savedAt: result.data.savedAt,
          phase: same(this.state.snapshot, this.confirmed) ? "saved" : "dirty",
          failure: null,
        });
        try {
          this.adapter.onSaved?.(this.state.draftId);
        } catch {
          /* Persisted data remains confirmed even if URL update fails. */
        }
        return true;
      })
      .finally(() => {
        if (!this.active || generation !== this.generation) return;
        this.inflight = null;
        this.schedule();
      });
    this.inflight = operation;
    return operation;
  }
  async flush(force = false): Promise<boolean> {
    this.clearTimer();
    if (!this.active || this.state.composing || this.state.phase === "conflict") return false;
    if (this.inflight && !(await this.inflight)) return false;
    while (
      this.active &&
      (this.pending ||
        !same(this.state.snapshot, this.confirmed) ||
        (force && this.state.revision === 0))
    ) {
      if (this.state.composing) return false;
      if (!(await this.saveOne())) return false;
    }
    return this.active;
  }
  retry = async () => {
    if (this.isFrozen() || this.state.phase === "conflict") return false;
    this.patch({
      failure: null,
      phase: this.isDirty() ? this.state.phase : this.state.revision ? "saved" : "idle",
    });
    return this.flush();
  };
  async submit() {
    if (!this.active || this.isFrozen() || this.state.composing || this.state.phase === "conflict")
      return;
    this.patch({ publication: "saving", failure: null });
    if (!(await this.flush(true))) {
      this.patch({ publication: "idle" });
      return;
    }
    this.publishInput = {
      draftId: this.state.draftId,
      expectedRevision: this.state.revision,
      publishRequestId: crypto.randomUUID(),
    };
    await this.confirmPublication();
  }
  async confirmPublication() {
    if (
      !this.active ||
      this.confirming ||
      !this.publishInput ||
      this.state.publication === "success"
    )
      return;
    this.confirming = true;
    const generation = this.generation;
    this.patch({ publication: "publishing", failure: null });
    try {
      const result = await this.adapter.publish(this.publishInput);
      if (!this.active || generation !== this.generation) return;
      if (result.status === "success") {
        this.patch({
          publication: "success",
          result: result.data,
          publishedRevision: result.data.publishedRevision,
        });
      } else if (result.status === "temporary_failure") {
        this.patch({ publication: "unknown", failure: result });
      } else {
        this.publishInput = null;
        this.patch({
          publication: "idle",
          failure: result,
          phase:
            result.status === "conflict" || result.status === "not_found" ? "conflict" : "failed",
        });
      }
    } catch {
      this.patch({
        publication: "unknown",
        failure: {
          status: "temporary_failure",
          message: "无法确认发布结果，请重试确认。当前输入已保留。",
        },
      });
    } finally {
      this.confirming = false;
    }
  }
  async loadLatest() {
    if (!this.active || this.isFrozen() || this.inflight) return false;
    const generation = this.generation;
    this.patch({ loadingLatest: true });
    try {
      const result = await this.adapter.load(this.state.draftId, this.state.blogId);
      if (!this.active || generation !== this.generation) return false;
      if (result.status !== "success") {
        this.patch({ failure: result });
        return false;
      }
      this.clearTimer();
      this.generation++;
      this.pending = null;
      this.publishInput = null;
      this.confirmed = snapshotOf(result.data);
      this.patch({
        snapshot: snapshotOf(result.data),
        draftId: result.data.draftId ?? crypto.randomUUID(),
        blogId: result.data.blogId,
        revision: result.data.revision,
        publishedRevision: result.data.publishedRevision,
        savedAt: result.data.savedAt,
        failure: null,
        phase: result.data.revision ? "saved" : "idle",
        publication: "idle",
        result: null,
      });
      return true;
    } catch {
      this.patch({ failure: transportFailure });
      return false;
    } finally {
      this.patch({ loadingLatest: false });
    }
  }
  // React Strict Mode may subscribe again after its development cleanup cycle.
  activate() {
    this.active = true;
    this.schedule();
  }
  dispose() {
    this.active = false;
    this.generation++;
    this.clearTimer();
    this.inflight = null;
  }
}
