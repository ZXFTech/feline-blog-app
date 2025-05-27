-- CreateTable
CREATE TABLE `TagsOnTodo` (
    `todoId` INTEGER NOT NULL,
    `tagId` INTEGER NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`todoId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TagsOnTodo` ADD CONSTRAINT `TagsOnTodo_todoId_fkey` FOREIGN KEY (`todoId`) REFERENCES `Todo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TagsOnTodo` ADD CONSTRAINT `TagsOnTodo_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
