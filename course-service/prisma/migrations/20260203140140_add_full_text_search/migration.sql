-- DropIndex
DROP INDEX "course_service"."Course_fts_idx";

-- AlterTable
ALTER TABLE "course_service"."Course" ALTER COLUMN "language" SET DEFAULT 'simple';
