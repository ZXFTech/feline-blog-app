/*
  Warnings:

  - You are about to drop the column `duration` on the `pomodororecord` table. All the data in the column will be lost.
  - Added the required column `actualDurationMs` to the `PomodoroRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `durationMs` to the `PomodoroRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `pomodororecord` DROP COLUMN `duration`,
    ADD COLUMN `actualDurationMs` DOUBLE NOT NULL,
    ADD COLUMN `durationMs` DOUBLE NOT NULL;
