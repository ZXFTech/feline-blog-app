/*
  Warnings:

  - Made the column `duration` on table `workoutset` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `workoutset` ADD COLUMN `calories` INTEGER NOT NULL DEFAULT 0,
    MODIFY `reps` INTEGER NULL,
    MODIFY `order` INTEGER NULL,
    MODIFY `duration` INTEGER NOT NULL;
