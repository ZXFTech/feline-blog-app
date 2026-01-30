-- CreateTable
CREATE TABLE `tomatoTaskList` (
    `id` VARCHAR(191) NOT NULL,
    `createAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NOT NULL,
    `isFinished` BOOLEAN NOT NULL,
    `summary` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `tomatoTaskList_id_userId_idx`(`id`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tomatoTaskList` ADD CONSTRAINT `tomatoTaskList_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
