-- 1. Create Enum
CREATE TYPE "course_service"."CourseLevel" AS ENUM ('Beginner', 'Intermediate', 'Advanced', 'Expert', 'AllLevels');

-- 2. Drop Constraints & Tables
ALTER TABLE "course_service"."CourseSkill" DROP CONSTRAINT IF EXISTS "CourseSkill_course_id_fkey";
ALTER TABLE "course_service"."CourseSkill" DROP CONSTRAINT IF EXISTS "CourseSkill_skill_id_fkey";
DROP TABLE IF EXISTS "course_service"."CourseSkill";
DROP TABLE IF EXISTS "course_service"."Skill";

-- 3. Alter Table - Add columns
ALTER TABLE "course_service"."Course" 
ADD COLUMN "course_level" "course_service"."CourseLevel" NOT NULL DEFAULT 'Beginner',
ADD COLUMN "language" TEXT NOT NULL DEFAULT 'english', -- Changed from 'simple'
ADD COLUMN "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "fts_vector" tsvector;

-- 4. Create Function with proper name (NO parenthesis)
CREATE OR REPLACE FUNCTION "course_service".courses_tsvector_trigger() RETURNS trigger AS $$
BEGIN
  -- Safe language mapping with fallback
  NEW.fts_vector := to_tsvector(
    CASE 
      WHEN NEW.language = 'english' THEN 'english'::regconfig
      WHEN NEW.language = 'simple' THEN 'simple'::regconfig
      -- Add more languages as needed
      ELSE 'english'::regconfig
    END,
    coalesce(NEW.title, '') || ' ' || 
    coalesce(NEW.long_description, '') || ' ' || 
    coalesce(NEW.short_description, '')
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 5. Create Trigger
CREATE TRIGGER tsvectorupdate 
BEFORE INSERT OR UPDATE ON "course_service"."Course" 
FOR EACH ROW 
EXECUTE FUNCTION "course_service"."courses_tsvector_trigger"();

-- 6. Backfill existing data
UPDATE "course_service"."Course" 
SET fts_vector = to_tsvector(
  CASE 
    WHEN language = 'english' THEN 'english'::regconfig
    WHEN language = 'simple' THEN 'simple'::regconfig
    ELSE 'english'::regconfig
  END,
  coalesce(title, '') || ' ' || 
  coalesce(long_description, '') || ' ' || 
  coalesce(short_description, '')
);

-- 7. Create GIN Index
CREATE INDEX "Course_fts_idx" ON "course_service"."Course" USING GIN ("fts_vector");