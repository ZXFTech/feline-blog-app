-- AlterTable
ALTER TABLE `PomodoroRecord`
    ADD COLUMN `eventId` VARCHAR(191) NULL,
    ADD COLUMN `endReason` ENUM('COMPLETED', 'SKIPPED', 'STOPPED') NULL,
    MODIFY `startAt` DATETIME(3) NOT NULL,
    MODIFY `endAt` DATETIME(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `PomodoroRecord_userId_eventId_key`
    ON `PomodoroRecord`(`userId`, `eventId`);
