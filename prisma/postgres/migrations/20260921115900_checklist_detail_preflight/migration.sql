-- This migration deliberately sorts immediately before the detail-only shape migration.
-- Existing aggregates cannot be converted without inventing item details, so deployment
-- must stop before the later structural migration can write or delete anything.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Checklist" LIMIT 1) THEN
    RAISE EXCEPTION 'Checklist detail-only migration requires an empty checklist data set; run the explicit environment-allowlisted reset tool first';
  END IF;
END $$;
