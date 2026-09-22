CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "Checklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" VARCHAR(191) NOT NULL,
    "createRequestId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "themeColor" VARCHAR(16) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Checklist_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "Checklist_name_check" CHECK (char_length("name") BETWEEN 1 AND 100)
);

CREATE TABLE "ChecklistItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "checklistId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "detail" VARCHAR(2000),
    "confirmedAt" TIMESTAMPTZ(3),
    "createdOrder" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChecklistItem_createdOrder_check" CHECK ("createdOrder" > 0),
    CONSTRAINT "ChecklistItem_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "ChecklistItem_name_check" CHECK (char_length("name") BETWEEN 1 AND 200),
    CONSTRAINT "ChecklistItem_detail_check" CHECK ("detail" IS NULL OR char_length("detail") <= 2000)
);

CREATE UNIQUE INDEX "Checklist_userId_createRequestId_key"
ON "Checklist"("userId", "createRequestId");

CREATE INDEX "Checklist_userId_idx" ON "Checklist"("userId");

CREATE INDEX "Checklist_active_expiry_idx"
ON "Checklist"("userId", "expiresAt", "id")
WHERE "deletedAt" IS NULL;

CREATE INDEX "Checklist_name_trgm_idx"
ON "Checklist" USING GIN ("name" gin_trgm_ops);

CREATE UNIQUE INDEX "ChecklistItem_checklistId_createdOrder_key"
ON "ChecklistItem"("checklistId", "createdOrder");

CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

CREATE INDEX "ChecklistItem_active_order_idx"
ON "ChecklistItem"("checklistId", "createdOrder", "id")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "ChecklistItem_active_name_key"
ON "ChecklistItem"("checklistId", lower("name"))
WHERE "deletedAt" IS NULL;

CREATE INDEX "ChecklistItem_name_trgm_idx"
ON "ChecklistItem" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "ChecklistItem_detail_trgm_idx"
ON "ChecklistItem" USING GIN ("detail" gin_trgm_ops);

ALTER TABLE "Checklist"
ADD CONSTRAINT "Checklist_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChecklistItem"
ADD CONSTRAINT "ChecklistItem_checklistId_fkey"
FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
