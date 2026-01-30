/*
  Warnings:

  - Added the required column `breakTime` to the `tomatoTaskList` table without a default value. This is not possible if the table is not empty.
  - Added the required column `focusTime` to the `tomatoTaskList` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startedAt` to the `tomatoTaskList` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `tomatotasklist` ADD COLUMN `breakTime` INTEGER NOT NULL,
    ADD COLUMN `focusTime` INTEGER NOT NULL,
    ADD COLUMN `startedAt` DATETIME(3) NOT NULL,
    MODIFY `createAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
