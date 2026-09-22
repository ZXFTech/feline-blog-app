-- DropIndex
DROP INDEX "Checklist_name_trgm_idx";

-- DropIndex
DROP INDEX "ChecklistItem_detail_trgm_idx";

-- DropIndex
DROP INDEX "ChecklistItem_name_trgm_idx";

-- AlterTable
ALTER TABLE "Checklist" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChecklistItem" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
