/*
  Warnings:

  - You are about to drop the column `finish` on the `todo` table. All the data in the column will be lost.
  - You are about to drop the column `finishAt` on the `todo` table. All the data in the column will be lost.
  - Added the required column `finishedAt` to the `Todo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `todo` DROP COLUMN `finish`,
    DROP COLUMN `finishAt`,
    ADD COLUMN `finished` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `finishedAt` DATETIME(3) NOT NULL;
