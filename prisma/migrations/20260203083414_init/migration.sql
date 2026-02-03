/*
  Warnings:

  - Added the required column `endAt` to the `PomodoroRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updateAt` to the `PomodoroRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `pomodororecord` ADD COLUMN `createAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `endAt` DATETIME(3) NOT NULL,
    ADD COLUMN `updateAt` DATETIME(3) NOT NULL;
