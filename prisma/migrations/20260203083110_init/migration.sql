-- CreateTable
CREATE TABLE `PomodoroRecord` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('FOCUS', 'SHORT', 'LONG') NOT NULL,
    `finished` BOOLEAN NOT NULL,
    `summary` TEXT NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `duration` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PomodoroRecord` ADD CONSTRAINT `PomodoroRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
