-- AlterTable
ALTER TABLE `blog` ADD COLUMN `favoriteCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `likeCount` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `BlogLike` (
    `id` VARCHAR(191) NOT NULL,
    `blogId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BlogLike_userId_idx`(`userId`),
    INDEX `BlogLike_blogId_idx`(`blogId`),
    UNIQUE INDEX `BlogLike_blogId_userId_key`(`blogId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BlogFavorite` (
    `id` VARCHAR(191) NOT NULL,
    `blogId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BlogFavorite_userId_idx`(`userId`),
    INDEX `BlogFavorite_blogId_idx`(`blogId`),
    UNIQUE INDEX `BlogFavorite_blogId_userId_key`(`blogId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BlogLike` ADD CONSTRAINT `BlogLike_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlogLike` ADD CONSTRAINT `BlogLike_blogId_fkey` FOREIGN KEY (`blogId`) REFERENCES `Blog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlogFavorite` ADD CONSTRAINT `BlogFavorite_blogId_fkey` FOREIGN KEY (`blogId`) REFERENCES `Blog`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BlogFavorite` ADD CONSTRAINT `BlogFavorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
