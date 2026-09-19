-- Preserve the case-insensitive uniqueness used by legacy utf8mb4_unicode_ci.
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'ROOT', 'VISITOR');

-- CreateEnum
CREATE TYPE "PomodoroType" AS ENUM ('FOCUS', 'SHORT', 'LONG');

-- CreateEnum
CREATE TYPE "PomodoroEndReason" AS ENUM ('COMPLETED', 'SKIPPED', 'STOPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(191) NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" CITEXT,
    "username" VARCHAR(191) NOT NULL,
    "password" VARCHAR(191) NOT NULL,
    "avatar" VARCHAR(191),
    "work" VARCHAR(191),
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" VARCHAR(191) NOT NULL,
    "sessionToken" VARCHAR(191) NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" VARCHAR(191) NOT NULL,
    "token" VARCHAR(191) NOT NULL,
    "expires" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Blog" (
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
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "content" CITEXT NOT NULL,
    "color" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "userId" VARCHAR(191) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Todo" (
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
CREATE TABLE "TagsOnTodos" (
    "todoId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" VARCHAR(191) NOT NULL,

    CONSTRAINT "TagsOnTodos_pkey" PRIMARY KEY ("todoId","tagId")
);

-- CreateTable
CREATE TABLE "TagsOnBlogs" (
    "blogId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" VARCHAR(191) NOT NULL,

    CONSTRAINT "TagsOnBlogs_pkey" PRIMARY KEY ("blogId","tagId")
);

-- CreateTable
CREATE TABLE "BlogLike" (
    "id" VARCHAR(191) NOT NULL,
    "blogId" INTEGER NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlogFavorite" (
    "id" VARCHAR(191) NOT NULL,
    "blogId" INTEGER NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStat" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMPTZ(3) NOT NULL,
    "typingCount" INTEGER NOT NULL DEFAULT 0,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutItem" (
    "id" SERIAL NOT NULL,
    "name" CITEXT NOT NULL,
    "exerciseId" INTEGER NOT NULL,
    "dailyStatId" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSet" (
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
CREATE TABLE "Exercise" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(191) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prompt" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "platform" VARCHAR(191) NOT NULL,
    "originId" VARCHAR(191) NOT NULL,
    "imageUrl" VARCHAR(191),
    "marks" VARCHAR(191) NOT NULL,

    CONSTRAINT "Prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PomodoroRecord" (
    "id" UUID NOT NULL,
    "userId" VARCHAR(191) NOT NULL,
    "type" "PomodoroType" NOT NULL,
    "eventId" VARCHAR(191),
    "endReason" "PomodoroEndReason",
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
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_content_key" ON "Tag"("userId", "content");

-- CreateIndex
CREATE INDEX "BlogLike_userId_idx" ON "BlogLike"("userId");

-- CreateIndex
CREATE INDEX "BlogLike_blogId_idx" ON "BlogLike"("blogId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogLike_blogId_userId_key" ON "BlogLike"("blogId", "userId");

-- CreateIndex
CREATE INDEX "BlogFavorite_userId_idx" ON "BlogFavorite"("userId");

-- CreateIndex
CREATE INDEX "BlogFavorite_blogId_idx" ON "BlogFavorite"("blogId");

-- CreateIndex
CREATE UNIQUE INDEX "BlogFavorite_blogId_userId_key" ON "BlogFavorite"("blogId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStat_date_key" ON "DailyStat"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutItem_dailyStatId_exerciseId_key" ON "WorkoutItem"("dailyStatId", "exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PomodoroRecord_userId_eventId_key" ON "PomodoroRecord"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blog" ADD CONSTRAINT "Blog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnTodos" ADD CONSTRAINT "TagsOnTodos_todoId_fkey" FOREIGN KEY ("todoId") REFERENCES "Todo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnTodos" ADD CONSTRAINT "TagsOnTodos_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnBlogs" ADD CONSTRAINT "TagsOnBlogs_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagsOnBlogs" ADD CONSTRAINT "TagsOnBlogs_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogLike" ADD CONSTRAINT "BlogLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogLike" ADD CONSTRAINT "BlogLike_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogFavorite" ADD CONSTRAINT "BlogFavorite_blogId_fkey" FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogFavorite" ADD CONSTRAINT "BlogFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutItem" ADD CONSTRAINT "WorkoutItem_dailyStatId_fkey" FOREIGN KEY ("dailyStatId") REFERENCES "DailyStat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutItemId_fkey" FOREIGN KEY ("workoutItemId") REFERENCES "WorkoutItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PomodoroRecord" ADD CONSTRAINT "PomodoroRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
