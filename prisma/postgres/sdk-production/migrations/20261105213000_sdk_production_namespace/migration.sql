-- Host baseline for the explicitly authorized new production namespace only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL search_path=feline_sdk_prod,pg_catalog,public;
DO $target$
BEGIN
 IF current_database()<>'postgres' OR current_user<>'blog_sdk_prod_migrator'
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_namespace n JOIN pg_catalog.pg_roles r ON r.oid=n.nspowner WHERE n.nspname='feline_sdk_prod' AND r.rolname=current_user)
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='feline_sdk_prod' AND NOT (c.relname='_prisma_migrations' OR
      (c.relkind='i' AND EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
        WHERE i.indexrelid=c.oid AND t.relnamespace=n.oid AND t.relname='_prisma_migrations'))))
  OR EXISTS(SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='feline_sdk_prod' AND t.typtype='e')
 THEN RAISE EXCEPTION 'SDK_NAMESPACE_INITIALIZATION_REJECTED'; END IF;
END $target$;

-- CreateEnum
CREATE TYPE "feline_sdk_prod"."Role" AS ENUM ('USER', 'ADMIN', 'ROOT', 'VISITOR');

-- CreateEnum
CREATE TYPE "feline_sdk_prod"."PomodoroType" AS ENUM ('FOCUS', 'SHORT', 'LONG');

-- CreateEnum
CREATE TYPE "feline_sdk_prod"."PomodoroEndReason" AS ENUM ('COMPLETED', 'SKIPPED', 'STOPPED');

-- CreateTable
CREATE TABLE "feline_sdk_prod"."_app_postgres_connection_probe" (
    "id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "_app_postgres_connection_probe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."users" (
    "id" VARCHAR(191) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" CITEXT,
    "username" VARCHAR(191) NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "profileCompletedAt" TIMESTAMPTZ(3),
    "profileEmailSnapshot" CITEXT,
    "profileEmailConfirmedAt" TIMESTAMPTZ(3),
    "businessCreatedAt" TIMESTAMPTZ(3),
    "businessUpdatedAt" TIMESTAMPTZ(3),
    "password" VARCHAR(191),
    "authMode" VARCHAR(10) NOT NULL DEFAULT 'sdk',
    "authVersion" INTEGER NOT NULL DEFAULT 0,
    "avatar" VARCHAR(191),
    "work" VARCHAR(191),
    "role" "feline_sdk_prod"."Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."feline_auth_identity" (
    "id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "user_id" VARCHAR(191) NOT NULL,
    "verified_email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3) NOT NULL,
    "bound_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_from" TEXT NOT NULL,
    "legacy_verified_at" TIMESTAMPTZ(3),

    CONSTRAINT "feline_auth_identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."feline_auth_browser" (
    "id" UUID NOT NULL,
    "browser_token_hash" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "current_flow_id" UUID,
    "require_fresh_auth" BOOLEAN NOT NULL DEFAULT false,
    "last_logout_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feline_auth_browser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."feline_auth_flow" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "state_hash" TEXT NOT NULL,
    "browser_state_id" UUID NOT NULL,
    "browser_epoch" INTEGER NOT NULL,
    "protocol_encrypted" TEXT,
    "candidate_encrypted" TEXT,
    "candidate_digest" TEXT,
    "confirmation_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "legacy_user_id" VARCHAR(191),
    "legacy_auth_version" INTEGER,
    "legacy_verified_at" TIMESTAMPTZ(3),
    "require_fresh_auth" BOOLEAN NOT NULL DEFAULT false,
    "reauth_after" TIMESTAMPTZ(3),
    "destination" TEXT NOT NULL,

    CONSTRAINT "feline_auth_flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."feline_auth_session" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" VARCHAR(191) NOT NULL,
    "identity_id" UUID NOT NULL,
    "auth_version" INTEGER NOT NULL,
    "browser_state_id" UUID NOT NULL,
    "browser_epoch" INTEGER NOT NULL,
    "grant_encrypted" TEXT,
    "grant_key_id" TEXT,
    "center_session_id" TEXT NOT NULL,
    "center_token_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "feline_auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."feline_auth_rate" (
    "key_hash" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feline_auth_rate_pkey" PRIMARY KEY ("key_hash","operation","window_start")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."Checklist" (
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

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."ChecklistItem" (
    "id" UUID NOT NULL,
    "checklistId" UUID NOT NULL,
    "detail" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "createdOrder" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."legacy_sessions" (
    "id" VARCHAR(191) NOT NULL,
    "sessionToken" VARCHAR(191) NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "legacy_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."sessions" (
    "id" VARCHAR(191) NOT NULL,
    "token" TEXT NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."auth_accounts" (
    "id" VARCHAR(191) NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ(3),
    "refreshTokenExpiresAt" TIMESTAMPTZ(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."auth_verifications" (
    "id" VARCHAR(191) NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."AuthInstallState" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "phase" TEXT NOT NULL DEFAULT 'awaiting_root',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "targetGeneration" UUID NOT NULL,
    "rootUserId" VARCHAR(191),
    "rootInitializedAt" TIMESTAMPTZ(3),
    "rootIssuer" TEXT,
    "rootSubjectDigest" CHAR(64),
    "operatorLabel" TEXT,
    "bootstrapPlanDigest" CHAR(64),
    "restoreRunId" UUID,
    "activationPlanDigest" CHAR(64),
    "activationEvidenceRef" TEXT,
    "activationEvidenceSha256" CHAR(64),
    "activatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AuthInstallState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."BusinessRestoreRun" (
    "id" UUID NOT NULL,
    "backupId" UUID NOT NULL,
    "manifestSha256" CHAR(64) NOT NULL,
    "planDigest" CHAR(64) NOT NULL,
    "targetGeneration" UUID NOT NULL,
    "sourceUserId" VARCHAR(191) NOT NULL,
    "targetUserId" VARCHAR(191) NOT NULL,
    "rowCounts" JSONB NOT NULL,
    "contentDigest" CHAR(64) NOT NULL,
    "completedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BusinessRestoreRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."verification_tokens" (
    "identifier" VARCHAR(191) NOT NULL,
    "token" VARCHAR(191) NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."Blog" (
    "id" SERIAL NOT NULL,
    "authorId" VARCHAR(191) NOT NULL,
    "title" VARCHAR(191) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "delete" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Blog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."Tag" (
    "id" SERIAL NOT NULL,
    "content" CITEXT NOT NULL,
    "color" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" VARCHAR(191) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."Todo" (
    "id" SERIAL NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "finished" BOOLEAN NOT NULL DEFAULT false,
    "createAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMPTZ(3) NOT NULL,
    "finishedAt" TIMESTAMPTZ(3) NOT NULL,
    "delete" BOOLEAN NOT NULL DEFAULT false,
    "userId" VARCHAR(191) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."TagsOnTodos" (
    "todoId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" VARCHAR(191) NOT NULL,

    CONSTRAINT "TagsOnTodos_pkey" PRIMARY KEY ("todoId","tagId")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."TagsOnBlogs" (
    "blogId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" VARCHAR(191) NOT NULL,

    CONSTRAINT "TagsOnBlogs_pkey" PRIMARY KEY ("blogId","tagId")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."BlogLike" (
    "id" VARCHAR(191) NOT NULL,
    "blogId" INTEGER NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."BlogFavorite" (
    "id" VARCHAR(191) NOT NULL,
    "blogId" INTEGER NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."DailyStat" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "typingCount" INTEGER NOT NULL DEFAULT 0,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."WorkoutItem" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "dailyStatId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."WorkoutSet" (
    "id" SERIAL NOT NULL,
    "reps" INTEGER,
    "order" INTEGER,
    "weight" DOUBLE PRECISION,
    "duration" INTEGER NOT NULL,
    "calories" INTEGER NOT NULL DEFAULT 0,
    "workoutItemId" INTEGER NOT NULL,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."Exercise" (
    "id" SERIAL NOT NULL,
    "name" CITEXT NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."Prompt" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "platform" VARCHAR(191) NOT NULL,
    "originId" VARCHAR(191) NOT NULL,
    "imageUrl" VARCHAR(191),
    "marks" VARCHAR(191) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feline_sdk_prod"."PomodoroRecord" (
    "id" UUID NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "type" "feline_sdk_prod"."PomodoroType" NOT NULL,
    "eventId" VARCHAR(191),
    "endReason" "feline_sdk_prod"."PomodoroEndReason",
    "finished" BOOLEAN NOT NULL,
    "summary" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMs" DOUBLE PRECISION NOT NULL,
    "actualDurationMs" DOUBLE PRECISION NOT NULL,
    "createAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PomodoroRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "_app_postgres_connection_probe_nonce_key" ON "feline_sdk_prod"."_app_postgres_connection_probe"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "feline_sdk_prod"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "feline_sdk_prod"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_identity_user_id_key" ON "feline_sdk_prod"."feline_auth_identity"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_identity_issuer_subject_key" ON "feline_sdk_prod"."feline_auth_identity"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_identity_id_user_id_key" ON "feline_sdk_prod"."feline_auth_identity"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_browser_browser_token_hash_key" ON "feline_sdk_prod"."feline_auth_browser"("browser_token_hash");

-- CreateIndex
CREATE INDEX "feline_auth_browser_expires_at_idx" ON "feline_sdk_prod"."feline_auth_browser"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_flow_state_hash_key" ON "feline_sdk_prod"."feline_auth_flow"("state_hash");

-- CreateIndex
CREATE INDEX "feline_auth_flow_expires_at_idx" ON "feline_sdk_prod"."feline_auth_flow"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_flow_id_browser_state_id_key" ON "feline_sdk_prod"."feline_auth_flow"("id", "browser_state_id");

-- CreateIndex
CREATE UNIQUE INDEX "feline_auth_session_token_hash_key" ON "feline_sdk_prod"."feline_auth_session"("token_hash");

-- CreateIndex
CREATE INDEX "feline_auth_session_expires_at_idx" ON "feline_sdk_prod"."feline_auth_session"("expires_at");

-- CreateIndex
CREATE INDEX "feline_auth_session_browser_state_id_idx" ON "feline_sdk_prod"."feline_auth_session"("browser_state_id");

-- CreateIndex
CREATE INDEX "feline_auth_rate_expires_at_idx" ON "feline_sdk_prod"."feline_auth_rate"("expires_at");

-- CreateIndex
CREATE INDEX "Checklist_userId_idx" ON "feline_sdk_prod"."Checklist"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Checklist_userId_createRequestId_key" ON "feline_sdk_prod"."Checklist"("userId", "createRequestId");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_idx" ON "feline_sdk_prod"."ChecklistItem"("checklistId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistItem_checklistId_createdOrder_key" ON "feline_sdk_prod"."ChecklistItem"("checklistId", "createdOrder");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_sessions_sessionToken_key" ON "feline_sdk_prod"."legacy_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "feline_sdk_prod"."sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "feline_sdk_prod"."sessions"("userId");

-- CreateIndex
CREATE INDEX "auth_accounts_userId_idx" ON "feline_sdk_prod"."auth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_providerId_accountId_key" ON "feline_sdk_prod"."auth_accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "auth_verifications_identifier_idx" ON "feline_sdk_prod"."auth_verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "AuthInstallState_restoreRunId_key" ON "feline_sdk_prod"."AuthInstallState"("restoreRunId");

-- CreateIndex
CREATE INDEX "AuthInstallState_rootUserId_idx" ON "feline_sdk_prod"."AuthInstallState"("rootUserId");

-- CreateIndex
CREATE INDEX "BusinessRestoreRun_targetUserId_idx" ON "feline_sdk_prod"."BusinessRestoreRun"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessRestoreRun_targetGeneration_manifestSha256_key" ON "feline_sdk_prod"."BusinessRestoreRun"("targetGeneration", "manifestSha256");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "feline_sdk_prod"."verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_content_key" ON "feline_sdk_prod"."Tag"("userId", "content");

-- CreateIndex
CREATE INDEX "BlogLike_userId_idx" ON "feline_sdk_prod"."BlogLike"("userId");

-- CreateIndex
CREATE INDEX "BlogLike_blogId_idx" ON "feline_sdk_prod"."BlogLike"("blogId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogLike_blogId_userId_key" ON "feline_sdk_prod"."BlogLike"("blogId", "userId");

-- CreateIndex
CREATE INDEX "BlogFavorite_userId_idx" ON "feline_sdk_prod"."BlogFavorite"("userId");

-- CreateIndex
CREATE INDEX "BlogFavorite_blogId_idx" ON "feline_sdk_prod"."BlogFavorite"("blogId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogFavorite_blogId_userId_key" ON "feline_sdk_prod"."BlogFavorite"("blogId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_date_key" ON "feline_sdk_prod"."DailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutItem_dailyStatId_exerciseId_key" ON "feline_sdk_prod"."WorkoutItem"("dailyStatId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "feline_sdk_prod"."Exercise"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PomodoroRecord_userId_eventId_key" ON "feline_sdk_prod"."PomodoroRecord"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_identity" ADD CONSTRAINT "feline_auth_identity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_browser" ADD CONSTRAINT "feline_auth_browser_current_flow_id_id_fkey" FOREIGN KEY ("current_flow_id", "id") REFERENCES "feline_sdk_prod"."feline_auth_flow"("id", "browser_state_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_flow" ADD CONSTRAINT "feline_auth_flow_browser_state_id_fkey" FOREIGN KEY ("browser_state_id") REFERENCES "feline_sdk_prod"."feline_auth_browser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_flow" ADD CONSTRAINT "feline_auth_flow_legacy_user_id_fkey" FOREIGN KEY ("legacy_user_id") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_session" ADD CONSTRAINT "feline_auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_session" ADD CONSTRAINT "feline_auth_session_identity_id_user_id_fkey" FOREIGN KEY ("identity_id", "user_id") REFERENCES "feline_sdk_prod"."feline_auth_identity"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."feline_auth_session" ADD CONSTRAINT "feline_auth_session_browser_state_id_fkey" FOREIGN KEY ("browser_state_id") REFERENCES "feline_sdk_prod"."feline_auth_browser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."Checklist" ADD CONSTRAINT "Checklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."ChecklistItem" ADD CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "feline_sdk_prod"."Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."legacy_sessions" ADD CONSTRAINT "legacy_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."auth_accounts" ADD CONSTRAINT "auth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."AuthInstallState" ADD CONSTRAINT "AuthInstallState_rootUserId_fkey" FOREIGN KEY ("rootUserId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."AuthInstallState" ADD CONSTRAINT "AuthInstallState_restoreRunId_fkey" FOREIGN KEY ("restoreRunId") REFERENCES "feline_sdk_prod"."BusinessRestoreRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."BusinessRestoreRun" ADD CONSTRAINT "BusinessRestoreRun_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."Blog" ADD CONSTRAINT "Blog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."TagsOnTodos" ADD CONSTRAINT "TagsOnTodos_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "feline_sdk_prod"."Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."TagsOnTodos" ADD CONSTRAINT "TagsOnTodos_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "feline_sdk_prod"."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."TagsOnBlogs" ADD CONSTRAINT "TagsOnBlogs_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "feline_sdk_prod"."Blog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."TagsOnBlogs" ADD CONSTRAINT "TagsOnBlogs_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "feline_sdk_prod"."Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."BlogLike" ADD CONSTRAINT "BlogLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."BlogLike" ADD CONSTRAINT "BlogLike_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "feline_sdk_prod"."Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."BlogFavorite" ADD CONSTRAINT "BlogFavorite_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "feline_sdk_prod"."Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."BlogFavorite" ADD CONSTRAINT "BlogFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."WorkoutItem" ADD CONSTRAINT "WorkoutItem_dailyStatId_fkey" FOREIGN KEY ("dailyStatId") REFERENCES "feline_sdk_prod"."DailyStat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutItemId_fkey" FOREIGN KEY ("workoutItemId") REFERENCES "feline_sdk_prod"."WorkoutItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feline_sdk_prod"."PomodoroRecord" ADD CONSTRAINT "PomodoroRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "feline_sdk_prod"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New namespace only. Execute as its dedicated owner in the initial migration.
-- This script does not change public, auth_ops, existing roles or source data.
ALTER TABLE feline_sdk_prod.users ADD CONSTRAINT sdk_profile_complete CHECK (
  "profileCompletedAt" IS NULL OR (
    "profileEmailSnapshot" IS NOT NULL AND "profileEmailConfirmedAt" IS NOT NULL AND
    "businessCreatedAt" IS NOT NULL AND "businessUpdatedAt" IS NOT NULL AND
    char_length(username) BETWEEN 1 AND 64 AND username=btrim(username) AND username !~ '[[:cntrl:]]'));
ALTER TABLE feline_sdk_prod.users ADD CONSTRAINT sdk_auth_mode CHECK (
  ("authMode"='sdk' AND password IS NULL) OR
  ("authMode"='legacy' AND password IS NOT NULL) OR
  ("authMode"='center' AND password IS NULL AND "authVersion">0));
ALTER TABLE feline_sdk_prod."AuthInstallState" ADD CONSTRAINT sdk_install_valid CHECK (
  id='primary' AND revision>=0 AND phase IN ('awaiting_root','awaiting_restore','ready') AND
  (phase='awaiting_root' OR ("rootUserId" IS NOT NULL AND "rootInitializedAt" IS NOT NULL AND
    "rootIssuer" IS NOT NULL AND "rootSubjectDigest" IS NOT NULL AND "bootstrapPlanDigest" IS NOT NULL AND
    "rootSubjectDigest" ~ '^[a-f0-9]{64}$' AND "bootstrapPlanDigest" ~ '^[a-f0-9]{64}$')) AND
  (phase<>'ready' OR ("restoreRunId" IS NOT NULL AND "activatedAt" IS NOT NULL AND
    "activationPlanDigest" IS NOT NULL AND "activationEvidenceSha256" IS NOT NULL AND
    "activationPlanDigest" ~ '^[a-f0-9]{64}$' AND "activationEvidenceRef" IS NOT NULL AND
    "activationEvidenceSha256" ~ '^[a-f0-9]{64}$')));
ALTER TABLE feline_sdk_prod."BusinessRestoreRun" ADD CONSTRAINT sdk_restore_valid CHECK (
  "manifestSha256" ~ '^[a-f0-9]{64}$' AND "planDigest" ~ '^[a-f0-9]{64}$' AND "contentDigest" ~ '^[a-f0-9]{64}$');
INSERT INTO feline_sdk_prod."AuthInstallState" (id,"targetGeneration") VALUES ('primary',gen_random_uuid());

CREATE FUNCTION feline_sdk_prod.feline_sdk_guard_user() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
DECLARE maintenance boolean;
BEGIN
  SELECT pg_catalog.pg_has_role(current_user,c.relowner,'USAGE') INTO maintenance
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='feline_sdk_prod' AND c.relname='users';
  IF NOT coalesce(maintenance,false) THEN
    IF TG_OP='INSERT' AND (NEW.role<>'USER' OR NEW."authMode"<>'sdk' OR NEW.password IS NOT NULL OR NEW."authVersion"<>0) THEN
      RAISE EXCEPTION 'SDK_RUNTIME_USER_INSERT_REJECTED'; END IF;
    IF TG_OP='UPDATE' AND (NEW.role IS DISTINCT FROM OLD.role OR NEW."authMode" IS DISTINCT FROM OLD."authMode"
      OR NEW.password IS DISTINCT FROM OLD.password OR NEW."authVersion" IS DISTINCT FROM OLD."authVersion") THEN
      RAISE EXCEPTION 'SDK_RUNTIME_AUTHORITY_CHANGE_REJECTED'; END IF;
    IF TG_OP='DELETE' AND OLD."profileCompletedAt" IS NOT NULL THEN RAISE EXCEPTION 'SDK_COMPLETED_USER_DELETE_REJECTED'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $guard$;
CREATE TRIGGER feline_sdk_guard_user BEFORE INSERT OR UPDATE OR DELETE ON feline_sdk_prod.users
  FOR EACH ROW EXECUTE FUNCTION feline_sdk_prod.feline_sdk_guard_user();
CREATE FUNCTION feline_sdk_prod.feline_sdk_lock_installation() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $lock$
BEGIN
  PERFORM id FROM feline_sdk_prod."AuthInstallState" WHERE id='primary' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SDK_INSTALLATION_MISSING'; END IF;
END $lock$;

REVOKE ALL ON SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA feline_sdk_prod FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA feline_sdk_prod FROM anon,authenticated,service_role,blog_sdk_prod_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA feline_sdk_prod FROM anon,authenticated,service_role,blog_sdk_prod_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA feline_sdk_prod FROM anon,authenticated,service_role,blog_sdk_prod_runtime;
GRANT USAGE ON SCHEMA feline_sdk_prod TO blog_sdk_prod_runtime;
GRANT USAGE ON TYPE feline_sdk_prod."Role",feline_sdk_prod."PomodoroType",feline_sdk_prod."PomodoroEndReason" TO blog_sdk_prod_runtime;
DO $rls$
DECLARE object_name text;
BEGIN
  FOR object_name IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='feline_sdk_prod' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' LOOP
    EXECUTE pg_catalog.format('ALTER TABLE feline_sdk_prod.%I ENABLE ROW LEVEL SECURITY',object_name);
  END LOOP;
END $rls$;
GRANT SELECT,INSERT ON feline_sdk_prod.users TO blog_sdk_prod_runtime;
GRANT UPDATE(email,name,"emailVerified",image,"updatedAt","updateAt",username,avatar,phone,work,
  "profileCompletedAt","profileEmailSnapshot","profileEmailConfirmedAt","businessCreatedAt","businessUpdatedAt")
  ON feline_sdk_prod.users TO blog_sdk_prod_runtime;
CREATE POLICY sdk_runtime_select ON feline_sdk_prod.users FOR SELECT TO blog_sdk_prod_runtime USING(true);
CREATE POLICY sdk_runtime_insert ON feline_sdk_prod.users FOR INSERT TO blog_sdk_prod_runtime
  WITH CHECK(role='USER' AND "authMode"='sdk' AND password IS NULL AND "authVersion"=0);
CREATE POLICY sdk_runtime_update ON feline_sdk_prod.users FOR UPDATE TO blog_sdk_prod_runtime
  USING("authMode"='sdk') WITH CHECK("authMode"='sdk' AND password IS NULL);
GRANT SELECT,INSERT,DELETE ON feline_sdk_prod.sessions TO blog_sdk_prod_runtime;
GRANT SELECT,INSERT,UPDATE ON feline_sdk_prod.auth_accounts TO blog_sdk_prod_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON feline_sdk_prod.auth_verifications TO blog_sdk_prod_runtime;
GRANT SELECT,INSERT,UPDATE ON feline_sdk_prod.feline_auth_rate TO blog_sdk_prod_runtime;
CREATE POLICY sdk_runtime ON feline_sdk_prod.sessions TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
CREATE POLICY sdk_runtime ON feline_sdk_prod.auth_accounts TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
CREATE POLICY sdk_runtime ON feline_sdk_prod.auth_verifications TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
CREATE POLICY sdk_runtime ON feline_sdk_prod.feline_auth_rate TO blog_sdk_prod_runtime USING(true) WITH CHECK(true);
DO $business$
DECLARE object_name text;
BEGIN
  FOREACH object_name IN ARRAY ARRAY['Blog','Tag','Todo','TagsOnTodos','TagsOnBlogs','BlogLike','BlogFavorite',
    'DailyStat','WorkoutItem','WorkoutSet','Exercise','Prompt','PomodoroRecord','Checklist','ChecklistItem'] LOOP
    EXECUTE pg_catalog.format('GRANT SELECT,INSERT,UPDATE,DELETE ON feline_sdk_prod.%I TO blog_sdk_prod_runtime',object_name);
    EXECUTE pg_catalog.format('CREATE POLICY sdk_runtime ON feline_sdk_prod.%I TO blog_sdk_prod_runtime USING(true) WITH CHECK(true)',object_name);
  END LOOP;
END $business$;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA feline_sdk_prod TO blog_sdk_prod_runtime;
GRANT SELECT ON feline_sdk_prod."AuthInstallState",feline_sdk_prod."BusinessRestoreRun" TO blog_sdk_prod_runtime;
CREATE POLICY sdk_runtime_read ON feline_sdk_prod."AuthInstallState" FOR SELECT TO blog_sdk_prod_runtime USING(true);
CREATE POLICY sdk_runtime_read ON feline_sdk_prod."BusinessRestoreRun" FOR SELECT TO blog_sdk_prod_runtime USING(true);
GRANT EXECUTE ON FUNCTION feline_sdk_prod.feline_sdk_lock_installation() TO blog_sdk_prod_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA feline_sdk_prod REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA feline_sdk_prod REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA feline_sdk_prod REVOKE ALL ON SEQUENCES FROM PUBLIC;

DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace JOIN pg_catalog.pg_class other ON other.oid=c.confrelid WHERE c.contype='f' AND n.nspname='feline_sdk_prod' AND other.relnamespace<>n.oid) THEN RAISE EXCEPTION 'SDK_CROSS_NAMESPACE_REFERENCE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_class s ON s.oid=d.objid JOIN pg_catalog.pg_namespace n ON n.oid=s.relnamespace JOIN pg_catalog.pg_class t ON t.oid=d.refobjid WHERE d.classid='pg_class'::regclass AND d.refclassid='pg_class'::regclass AND s.relkind='S' AND n.nspname='feline_sdk_prod' AND t.relnamespace<>n.oid) THEN RAISE EXCEPTION 'SDK_CROSS_NAMESPACE_SEQUENCE'; END IF;
END $verify$;
COMMIT;
