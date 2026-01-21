/*
  Warnings:

  - A unique constraint covering the columns `[dailyStatId,exerciseId]` on the table `WorkoutItem` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `exerciseId` to the `WorkoutItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `workoutitem` ADD COLUMN `exerciseId` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `WorkoutItem_dailyStatId_exerciseId_key` ON `WorkoutItem`(`dailyStatId`, `exerciseId`);
