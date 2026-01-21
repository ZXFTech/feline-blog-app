-- CreateTable
CREATE TABLE `DailyStat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `typingCount` INTEGER NOT NULL DEFAULT 0,
    `stepCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DailyStat_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkoutItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `dailyStatId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkoutSet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reps` INTEGER NOT NULL,
    `order` INTEGER NOT NULL,
    `workoutItemId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WorkoutItem` ADD CONSTRAINT `WorkoutItem_dailyStatId_fkey` FOREIGN KEY (`dailyStatId`) REFERENCES `DailyStat`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkoutSet` ADD CONSTRAINT `WorkoutSet_workoutItemId_fkey` FOREIGN KEY (`workoutItemId`) REFERENCES `WorkoutItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
