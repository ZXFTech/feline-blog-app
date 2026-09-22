-- This feature has not shipped. Its existing checklist data is disposable by spec 0011.
-- Remove parents first so the aggregate invariant cannot be false during the shape change.
DELETE FROM "Checklist";

DROP INDEX "ChecklistItem_active_name_key";
DROP INDEX "ChecklistItem_name_trgm_idx";
DROP INDEX "ChecklistItem_detail_trgm_idx";

ALTER TABLE "ChecklistItem"
  DROP CONSTRAINT "ChecklistItem_name_check",
  DROP CONSTRAINT "ChecklistItem_detail_check",
  DROP COLUMN "name",
  ALTER COLUMN "detail" TYPE TEXT,
  ALTER COLUMN "detail" SET NOT NULL,
  ADD CONSTRAINT "ChecklistItem_detail_check"
    CHECK (char_length(btrim("detail")) BETWEEN 1 AND 2000);

CREATE INDEX "ChecklistItem_detail_trgm_idx"
ON "ChecklistItem" USING GIN ("detail" gin_trgm_ops);
