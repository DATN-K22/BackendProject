-- Step 1: Add the new columns to ChapterItem as Nullable
ALTER TABLE "course_service"."ChapterItem" 
ADD COLUMN "long_description" TEXT,
ADD COLUMN "short_description" TEXT,
ADD COLUMN "title" VARCHAR(255);

-- Step 2a: Migrate Lesson Data
UPDATE "course_service"."ChapterItem" AS c
SET title = l.title,
    short_description = l.short_description,
    long_description = l.long_description
FROM "course_service"."Lesson" AS l
WHERE c.lesson_id = l.id AND l.title IS NOT NULL;

-- Step 2b: Migrate Lab Data
UPDATE "course_service"."ChapterItem" AS c
SET title = lb.title,
    short_description = lb.short_description,
    long_description = lb.long_description
FROM "course_service"."Lab" AS lb
WHERE c.lab_id = lb.id AND lb.title IS NOT NULL;

-- Step 2c: Migrate Quiz Data
UPDATE "course_service"."ChapterItem" AS c
SET title = q.title,
    long_description = q.description
FROM "course_service"."Quiz" AS q
WHERE c.quiz_id = q.id AND q.title IS NOT NULL;

-- Step 2d: The Safety Net (Prevents the crash)
-- If any ChapterItem was orphaned and still has a NULL title, give it a placeholder so Step 3 doesn't crash.
UPDATE "course_service"."ChapterItem" 
SET title = 'Untitled Item' 
WHERE title IS NULL;

-- Step 3: Lock down the title column
ALTER TABLE "course_service"."ChapterItem" 
ALTER COLUMN "title" SET NOT NULL;

-- Step 4: Add new columns to Lab and Lesson
ALTER TABLE "course_service"."Lab" ADD COLUMN "instruction" TEXT;
ALTER TABLE "course_service"."Lesson" ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false;

-- Step 5: Clean up (Drop the old columns now that data is safely copied)
ALTER TABLE "course_service"."Lab" 
DROP COLUMN "long_description",
DROP COLUMN "short_description",
DROP COLUMN "title";

ALTER TABLE "course_service"."Lesson" 
DROP COLUMN "long_description",
DROP COLUMN "short_description",
DROP COLUMN "thumbnail_url",
DROP COLUMN "title";

ALTER TABLE "course_service"."Quiz" 
DROP COLUMN "description",
DROP COLUMN "title";