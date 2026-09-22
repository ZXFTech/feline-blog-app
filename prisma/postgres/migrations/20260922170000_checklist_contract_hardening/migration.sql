-- Existing checklist rows predate the versioned create payload fingerprint and cannot be
-- backfilled without inventing the original browser time-zone payload. Fail before writes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Checklist" LIMIT 1) THEN
    RAISE EXCEPTION 'Checklist contract migration requires an empty checklist data set; run the explicit environment-allowlisted reset tool first';
  END IF;
END $$;

DO $$
DECLARE
  deployed_collation text;
BEGIN
  SELECT datcollate INTO deployed_collation FROM pg_database WHERE datname = current_database();
  IF deployed_collation <> 'en_US.utf8' THEN
    RAISE EXCEPTION 'Unsupported checklist search collation: %, expected en_US.utf8', deployed_collation;
  END IF;
  IF NOT ('A' ILIKE 'a' AND 'É' ILIKE 'é' AND 'I' ILIKE 'i' AND NOT ('é' ILIKE 'e')) THEN
    RAISE EXCEPTION 'Checklist ILIKE collation verification vector failed';
  END IF;
END $$;

ALTER TABLE "Checklist"
  ADD COLUMN "createPayloadHash" CHAR(64) NOT NULL,
  ADD CONSTRAINT "Checklist_createPayloadHash_check"
    CHECK ("createPayloadHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "Checklist_name_normalized_check"
    CHECK (char_length("name") BETWEEN 1 AND 100 AND char_length(btrim("name")) > 0),
  ADD CONSTRAINT "Checklist_themeColor_check"
    CHECK ("themeColor" IN ('#20c997', '#0d6efd', '#6f42c1', '#52c41a', '#fadb14', '#fd7e14', '#d63384', '#6c757d'));

ALTER TABLE "ChecklistItem"
  DROP CONSTRAINT IF EXISTS "ChecklistItem_detail_check",
  ADD CONSTRAINT "ChecklistItem_detail_check"
    CHECK (char_length("detail") BETWEEN 1 AND 2000 AND char_length(btrim("detail")) > 0);

DROP INDEX IF EXISTS "Checklist_name_trgm_idx";
CREATE INDEX "Checklist_name_trgm_idx"
  ON "Checklist" USING GIN ("name" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

DROP INDEX IF EXISTS "ChecklistItem_detail_trgm_idx";
CREATE INDEX "ChecklistItem_detail_trgm_idx"
  ON "ChecklistItem" USING GIN ("detail" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX "Checklist_deletedAt_idx"
  ON "Checklist" ("userId", "deletedAt" DESC, "id")
  WHERE "deletedAt" IS NOT NULL;

CREATE INDEX "ChecklistItem_deletedAt_idx"
  ON "ChecklistItem" ("checklistId", "deletedAt" DESC, "id")
  WHERE "deletedAt" IS NOT NULL;

DO $$
DECLARE
  missing_constraints text[];
BEGIN
  SELECT array_agg(expected.name)
    INTO missing_constraints
  FROM (VALUES
    ('Checklist_revision_check'),
    ('Checklist_createPayloadHash_check'),
    ('Checklist_name_normalized_check'),
    ('Checklist_themeColor_check'),
    ('ChecklistItem_createdOrder_check'),
    ('ChecklistItem_revision_check'),
    ('ChecklistItem_detail_check')
  ) AS expected(name)
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = expected.name);

  IF missing_constraints IS NOT NULL THEN
    RAISE EXCEPTION 'Checklist constraints missing after migration: %', missing_constraints;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "Checklist", "ChecklistItem" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "Checklist", "ChecklistItem" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Checklist", "ChecklistItem" TO app_runtime;
  END IF;
END $$;
