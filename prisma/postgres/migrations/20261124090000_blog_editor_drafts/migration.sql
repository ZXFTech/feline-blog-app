BEGIN;

CREATE TABLE public."BlogDraft" (
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
  CONSTRAINT "BlogDraft_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BlogDraft_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES public."Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BlogDraft_blogId_key" ON public."BlogDraft"("blogId");
CREATE INDEX "BlogDraft_authorId_updatedAt_id_idx" ON public."BlogDraft"("authorId", "updatedAt" DESC, "id");

-- The receipt remains queryable after draft or article deletion.
CREATE TABLE public."BlogPublishReceipt" (
  "draftId" UUID NOT NULL,
  "publishRequestId" UUID NOT NULL,
  "authorId" VARCHAR(191) NOT NULL,
  "revision" INTEGER NOT NULL,
  "blogId" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogPublishReceipt_pkey" PRIMARY KEY ("draftId", "publishRequestId"),
  CONSTRAINT "BlogPublishReceipt_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "BlogPublishReceipt_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES public.users("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BlogPublishReceipt_authorId_idx" ON public."BlogPublishReceipt"("authorId");

REVOKE ALL ON public."BlogDraft", public."BlogPublishReceipt" FROM PUBLIC;
ALTER TABLE public."BlogDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."BlogPublishReceipt" ENABLE ROW LEVEL SECURITY;

-- Bare PostgreSQL replay has no platform roles. Grant only to the known runtime for this database.
DO $draft_access$
DECLARE
  api_role name;
  runtime_role name := CASE current_database()
    WHEN 'feline_blog_sdk_dev' THEN 'blog_sdk_runtime'
    WHEN 'feline_blog_sdk_online_dev' THEN 'blog_sdk_online_runtime'
    ELSE 'app_runtime'
  END;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE pg_catalog.format('REVOKE ALL ON public."BlogDraft", public."BlogPublishReceipt" FROM %I', api_role);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE pg_catalog.format('REVOKE ALL ON public."BlogDraft", public."BlogPublishReceipt" FROM %I', runtime_role);
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT, UPDATE ON public."BlogDraft" TO %I', runtime_role);
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON public."BlogPublishReceipt" TO %I', runtime_role);
    EXECUTE pg_catalog.format('CREATE POLICY "BlogDraft_runtime_read" ON public."BlogDraft" FOR SELECT TO %I USING (true)', runtime_role);
    EXECUTE pg_catalog.format('CREATE POLICY "BlogDraft_runtime_insert" ON public."BlogDraft" FOR INSERT TO %I WITH CHECK (true)', runtime_role);
    EXECUTE pg_catalog.format('CREATE POLICY "BlogDraft_runtime_update" ON public."BlogDraft" FOR UPDATE TO %I USING (true) WITH CHECK (true)', runtime_role);
    EXECUTE pg_catalog.format('CREATE POLICY "BlogPublishReceipt_runtime_read" ON public."BlogPublishReceipt" FOR SELECT TO %I USING (true)', runtime_role);
    EXECUTE pg_catalog.format('CREATE POLICY "BlogPublishReceipt_runtime_insert" ON public."BlogPublishReceipt" FOR INSERT TO %I WITH CHECK (true)', runtime_role);
  END IF;
END $draft_access$;

COMMIT;
