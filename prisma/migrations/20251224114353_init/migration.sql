/*
  Warnings:

  - You are about to drop the column `todoId` on the `tag` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `tag` DROP FOREIGN KEY `Tag_todoId_fkey`;

-- DropIndex
DROP INDEX `Tag_todoId_fkey` ON `tag`;

-- AlterTable
ALTER TABLE `tag` DROP COLUMN `todoId`;

-- CreateTable
CREATE TABLE `TagsOnTodos` (
    `todoId` INTEGER NOT NULL,
    `tagId` INTEGER NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `assignedBy` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`todoId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TagsOnTodos` ADD CONSTRAINT `TagsOnTodos_todoId_fkey` FOREIGN KEY (`todoId`) REFERENCES `Todo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TagsOnTodos` ADD CONSTRAINT `TagsOnTodos_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
