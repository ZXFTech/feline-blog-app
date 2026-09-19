/*
  Warnings:

  - Changed the type of `name` on the `Exercise` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "name",
ADD COLUMN     "name" CITEXT NOT NULL;

-- AlterTable
ALTER TABLE "WorkoutItem" ALTER COLUMN "name" SET DATA TYPE VARCHAR(191);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_name_key" ON "Exercise"("name");
