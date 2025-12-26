/*
  Warnings:

  - You are about to drop the column `blogId` on the `tag` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `tag` DROP FOREIGN KEY `Tag_blogId_fkey`;

-- DropIndex
DROP INDEX `Tag_blogId_fkey` ON `tag`;

-- AlterTable
ALTER TABLE `tag` DROP COLUMN `blogId`;
