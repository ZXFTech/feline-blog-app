-- CreateTable
CREATE TABLE `Prompt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `content` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `originId` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `marks` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
