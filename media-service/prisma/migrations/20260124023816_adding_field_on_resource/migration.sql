-- 1. Add column nullable trước
ALTER TABLE "media_service"."Resource"
ADD COLUMN "s3_key" VARCHAR(255),
ADD COLUMN "filename" VARCHAR(255);

-- 2. Backfill data (tùy logic của bạn)
UPDATE "media_service"."Resource"
SET 
  s3_key = COALESCE(link, 'unknown'),
  filename = 'unknown'
WHERE s3_key IS NULL;

-- 3. Set NOT NULL
ALTER TABLE "media_service"."Resource"
ALTER COLUMN "s3_key" SET NOT NULL,
ALTER COLUMN "filename" SET NOT NULL;
