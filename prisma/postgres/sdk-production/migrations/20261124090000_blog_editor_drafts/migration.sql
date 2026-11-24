BEGIN;

CREATE TABLE feline_sdk_prod."BlogDraft" (
  "id" UUID NOT NULL,
  "authorId" VARCHAR(191) NOT NULL,
  "blogId" INTEGER,
  "title" VARCHAR(191) NOT NULL,
  "content" TEXT NOT NULL,
  "tags" JSONB NOT NULL DEFAULT '[]',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "publishedRevision" INTEGER NOT NULL DEFAULT 0,
  "lastSaveRequestId" UUID NOT NULL,
  "lastSavePayloadHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMPTZ(3),
  CONSTRAINT "BlogDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BlogDraft_revision_check" CHECK ("revision" >= 1 AND "publishedRevision" BETWEEN 0 AND "revision"),
  CONSTRAINT "BlogDraft_tags_check" CHECK (jsonb_typeof("tags") = 'array'),
  CONSTRAINT "BlogDraft_hash_check" CHECK ("lastSavePayloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "BlogDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES feline_sdk_prod.users("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlogDraft_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES feline_sdk_prod."Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BlogDraft_blogId_key" ON feline_sdk_prod."BlogDraft"("blogId");
CREATE INDEX "BlogDraft_authorId_updatedAt_id_idx" ON feline_sdk_prod."BlogDraft"("authorId", "updatedAt" DESC, "id");

-- The receipt remains queryable after draft or article deletion.
CREATE TABLE feline_sdk_prod."BlogPublishReceipt" (
  "draftId" UUID NOT NULL,
  "publishRequestId" UUID NOT NULL,
  "authorId" VARCHAR(191) NOT NULL,
  "revision" INTEGER NOT NULL,
  "blogId" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogPublishReceipt_pkey" PRIMARY KEY ("draftId", "publishRequestId"),
  CONSTRAINT "BlogPublishReceipt_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "BlogPublishReceipt_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES feline_sdk_prod.users("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BlogPublishReceipt_authorId_idx" ON feline_sdk_prod."BlogPublishReceipt"("authorId");

REVOKE ALL ON feline_sdk_prod."BlogDraft", feline_sdk_prod."BlogPublishReceipt"
  FROM PUBLIC, anon, authenticated, service_role, blog_sdk_prod_runtime;
ALTER TABLE feline_sdk_prod."BlogDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE feline_sdk_prod."BlogPublishReceipt" ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON feline_sdk_prod."BlogDraft" TO blog_sdk_prod_runtime;
GRANT SELECT, INSERT ON feline_sdk_prod."BlogPublishReceipt" TO blog_sdk_prod_runtime;
CREATE POLICY "BlogDraft_runtime_read" ON feline_sdk_prod."BlogDraft" FOR SELECT TO blog_sdk_prod_runtime USING (true);
CREATE POLICY "BlogDraft_runtime_insert" ON feline_sdk_prod."BlogDraft" FOR INSERT TO blog_sdk_prod_runtime WITH CHECK (true);
CREATE POLICY "BlogDraft_runtime_update" ON feline_sdk_prod."BlogDraft" FOR UPDATE TO blog_sdk_prod_runtime USING (true) WITH CHECK (true);
CREATE POLICY "BlogPublishReceipt_runtime_read" ON feline_sdk_prod."BlogPublishReceipt" FOR SELECT TO blog_sdk_prod_runtime USING (true);
CREATE POLICY "BlogPublishReceipt_runtime_insert" ON feline_sdk_prod."BlogPublishReceipt" FOR INSERT TO blog_sdk_prod_runtime WITH CHECK (true);

COMMIT;
