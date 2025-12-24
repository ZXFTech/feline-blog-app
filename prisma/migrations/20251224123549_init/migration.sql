/*
  Warnings:

  - A unique constraint covering the columns `[userId,content]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Tag_userId_content_key` ON `Tag`(`userId`, `content`);
