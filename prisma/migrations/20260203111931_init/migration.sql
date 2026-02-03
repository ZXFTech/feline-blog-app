/*
  Warnings:

  - Added the required column `status` to the `PomodoroRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `pomodororecord` ADD COLUMN `status` ENUM('SKIPPED', 'FINISHED', 'STOPPED') NOT NULL,
    MODIFY `summary` TEXT NULL;
