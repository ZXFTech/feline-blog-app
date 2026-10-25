-- Managed Cron boundary state. No task activation or application data changes.
ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_mode" text DEFAULT 'disabled' NOT NULL;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_initial_floor" bigint;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_prune_floor" bigint;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_prune_cursor" bigint;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_prune_upper" bigint;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_prune_keep_from" bigint;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_prune_cutoff" timestamp with time zone;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_prune_next_expiry" timestamp with time zone;

ALTER TABLE "auth_ops"."cleanup_state" ADD COLUMN "history_next_expiry" timestamp with time zone;

CREATE INDEX "cleanup_run_success_idx" ON "auth_ops"."cleanup_run" USING btree ("job_name","cron_run_id" DESC NULLS LAST) WHERE "auth_ops"."cleanup_run"."result_code" IN ('complete','pending');

ALTER TABLE "auth_ops"."cleanup_state" ADD CONSTRAINT "cleanup_state_history_mode" CHECK ("auth_ops"."cleanup_state"."history_mode" IN ('disabled','managed-proxy-v1','isolated-direct-v1'));

ALTER TABLE "auth_ops"."cleanup_state" ADD CONSTRAINT "cleanup_state_history_shape" CHECK ((
    ("auth_ops"."cleanup_state"."history_mode"='managed-proxy-v1' AND "auth_ops"."cleanup_state"."cron_job_id" IS NOT NULL
      AND "auth_ops"."cleanup_state"."history_initial_floor" IS NOT NULL AND "auth_ops"."cleanup_state"."history_initial_floor">=0
      AND "auth_ops"."cleanup_state"."history_prune_floor" IS NOT NULL AND "auth_ops"."cleanup_state"."history_prune_floor">="auth_ops"."cleanup_state"."history_initial_floor"
      AND "auth_ops"."cleanup_state"."history_prune_cursor" IS NOT NULL AND "auth_ops"."cleanup_state"."history_prune_cursor">="auth_ops"."cleanup_state"."history_prune_floor"
      AND (("auth_ops"."cleanup_state"."history_prune_upper" IS NULL AND "auth_ops"."cleanup_state"."history_prune_cutoff" IS NULL AND "auth_ops"."cleanup_state"."history_prune_keep_from" IS NULL AND "auth_ops"."cleanup_state"."history_prune_next_expiry" IS NULL AND "auth_ops"."cleanup_state"."history_prune_cursor"="auth_ops"."cleanup_state"."history_prune_floor")
        OR ("auth_ops"."cleanup_state"."history_prune_upper" IS NOT NULL AND "auth_ops"."cleanup_state"."history_prune_cutoff" IS NOT NULL AND "auth_ops"."cleanup_state"."history_prune_upper">="auth_ops"."cleanup_state"."history_prune_cursor"
          AND ("auth_ops"."cleanup_state"."history_prune_keep_from" IS NULL OR ("auth_ops"."cleanup_state"."history_prune_keep_from">"auth_ops"."cleanup_state"."history_prune_floor" AND "auth_ops"."cleanup_state"."history_prune_keep_from"<="auth_ops"."cleanup_state"."history_prune_cursor")))))
    OR (("auth_ops"."cleanup_state"."history_mode"<>'managed-proxy-v1' OR "auth_ops"."cleanup_state"."cron_job_id" IS NULL)
      AND ("auth_ops"."cleanup_state"."history_mode"<>'disabled' OR "auth_ops"."cleanup_state"."cron_job_id" IS NULL)
      AND "auth_ops"."cleanup_state"."history_initial_floor" IS NULL AND "auth_ops"."cleanup_state"."history_prune_floor" IS NULL AND "auth_ops"."cleanup_state"."history_prune_cursor" IS NULL
      AND "auth_ops"."cleanup_state"."history_prune_upper" IS NULL AND "auth_ops"."cleanup_state"."history_prune_keep_from" IS NULL AND "auth_ops"."cleanup_state"."history_prune_cutoff" IS NULL AND "auth_ops"."cleanup_state"."history_prune_next_expiry" IS NULL AND "auth_ops"."cleanup_state"."history_next_expiry" IS NULL)));