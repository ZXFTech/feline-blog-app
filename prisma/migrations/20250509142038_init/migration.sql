/*
  Warnings:

  - You are about to alter the column `content` on the `blog` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Json`.

*/
-- AlterTable
ALTER TABLE `blog` MODIFY `content` JSON NOT NULL;
