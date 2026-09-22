-- CreateIndex
CREATE INDEX "Checklist_name_trgm_idx" ON "Checklist" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ChecklistItem_name_trgm_idx" ON "ChecklistItem" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ChecklistItem_detail_trgm_idx" ON "ChecklistItem" USING GIN ("detail" gin_trgm_ops);
