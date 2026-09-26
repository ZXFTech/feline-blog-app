CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- app_migrator owns migration objects. Its preconfigured default privileges grant
-- app_runtime the required table DML and sequence access. No application role
-- receives schema ownership or DDL privileges from this migration.
CREATE TABLE "Checklist" (
    "id" UUID NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "createRequestId" UUID NOT NULL,
    "createPayloadHash" CHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "themeColor" VARCHAR(16) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Checklist_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "Checklist_createPayloadHash_check"
        CHECK ("createPayloadHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "Checklist_name_normalized_check"
        CHECK (char_length("name") BETWEEN 1 AND 100 AND char_length(btrim("name")) > 0),
    CONSTRAINT "Checklist_themeColor_check"
        CHECK ("themeColor" IN ('#20c997', '#0d6efd', '#6f42c1', '#52c41a', '#fadb14', '#fd7e14', '#d63384', '#6c757d')),
    CONSTRAINT "Checklist_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ChecklistItem" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "detail" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdOrder" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChecklistItem_createdOrder_check" CHECK ("createdOrder" > 0),
    CONSTRAINT "ChecklistItem_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "ChecklistItem_detail_check"
        CHECK (char_length("detail") BETWEEN 1 AND 2000 AND char_length(btrim("detail")) > 0),
    CONSTRAINT "ChecklistItem_checklistId_fkey"
        FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Checklist_userId_createRequestId_key"
    ON "Checklist"("userId", "createRequestId");

CREATE INDEX "Checklist_userId_idx"
    ON "Checklist"("userId");

CREATE INDEX "Checklist_active_expiry_idx"
    ON "Checklist"("userId", "expiresAt", "id")
    WHERE "deletedAt" IS NULL;

CREATE INDEX "Checklist_name_trgm_idx"
    ON "Checklist" USING GIN ("name" gin_trgm_ops)
    WHERE "deletedAt" IS NULL;

CREATE INDEX "Checklist_deletedAt_idx"
    ON "Checklist"("userId", "deletedAt" DESC, "id")
    WHERE "deletedAt" IS NOT NULL;

CREATE UNIQUE INDEX "ChecklistItem_checklistId_createdOrder_key"
    ON "ChecklistItem"("checklistId", "createdOrder");

CREATE INDEX "ChecklistItem_checklistId_idx"
    ON "ChecklistItem"("checklistId");

CREATE INDEX "ChecklistItem_active_order_idx"
    ON "ChecklistItem"("checklistId", "createdOrder", "id")
    WHERE "deletedAt" IS NULL;

CREATE INDEX "ChecklistItem_detail_trgm_idx"
    ON "ChecklistItem" USING GIN ("detail" gin_trgm_ops)
    WHERE "deletedAt" IS NULL;

CREATE INDEX "ChecklistItem_deletedAt_idx"
    ON "ChecklistItem"("checklistId", "deletedAt" DESC, "id")
    WHERE "deletedAt" IS NOT NULL;
