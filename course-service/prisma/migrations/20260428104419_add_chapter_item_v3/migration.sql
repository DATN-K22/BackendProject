-- CreateEnum
CREATE TYPE "course_service"."ChapterItemType" AS ENUM ('lesson', 'quiz', 'lab');

-- DropForeignKey
ALTER TABLE "course_service"."Forum" DROP CONSTRAINT "Forum_course_id_fkey";

-- DropForeignKey
ALTER TABLE "course_service"."Lesson" DROP CONSTRAINT "Lesson_chapter_id_fkey";

-- DropForeignKey
ALTER TABLE "course_service"."LessonStatus" DROP CONSTRAINT "LessonStatus_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "course_service"."Message" DROP CONSTRAINT "Message_forum_id_fkey";

-- DropForeignKey
ALTER TABLE "course_service"."Message" DROP CONSTRAINT "Message_parent_message_id_fkey";

-- DropForeignKey
ALTER TABLE "course_service"."Quiz" DROP CONSTRAINT "Quiz_chapter_id_fkey";

-- DropIndex
DROP INDEX "course_service"."idx_lesson_chapter";

-- DropIndex
DROP INDEX "course_service"."idx_quiz_chapter";

-- CreateTable (keep as-is)
CREATE TABLE "course_service"."ChapterItem" (
    "id" BIGSERIAL NOT NULL,
    "chapter_id" BIGINT NOT NULL,
    "item_type" "course_service"."ChapterItemType" NOT NULL,
    "lesson_id" BIGINT,
    "quiz_id" BIGINT,
    "lab_id" BIGINT,
    "sort_order" INTEGER NOT NULL,
    CONSTRAINT "ChapterItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_service"."Lab" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "thumbnail_url" VARCHAR(255),
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'published',
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leaseTemplateId" VARCHAR(255),
    "resources" BIGINT[],
    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_service"."ChapterItemStatus" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "chapter_item_id" BIGINT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterItemStatus_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- DATA MIGRATION: backfill ChapterItem from Lesson and Quiz
-- Must run BEFORE dropping chapter_id / sort_order columns
-- ============================================================

-- Migrate lessons → ChapterItem
INSERT INTO "course_service"."ChapterItem"
  (chapter_id, item_type, lesson_id, sort_order)
SELECT
  chapter_id,
  'lesson'::"course_service"."ChapterItemType",
  id,
  COALESCE(sort_order, 0)
FROM "course_service"."Lesson"
WHERE chapter_id IS NOT NULL;

-- Migrate quizzes → ChapterItem
INSERT INTO "course_service"."ChapterItem"
  (chapter_id, item_type, quiz_id, sort_order)
SELECT
  chapter_id,
  'quiz'::"course_service"."ChapterItemType",
  id,
  (
    SELECT COALESCE(MAX(ci.sort_order), 0)
    FROM "course_service"."ChapterItem" ci
    WHERE ci.chapter_id = q.chapter_id
  ) + ROW_NUMBER() OVER (PARTITION BY chapter_id ORDER BY id)
FROM "course_service"."Quiz" q
WHERE chapter_id IS NOT NULL;

-- ============================================================
-- NOW safe to drop the source columns
-- ============================================================

ALTER TABLE "course_service"."Lesson" DROP COLUMN "chapter_id",
DROP COLUMN "sort_order",
DROP COLUMN "type";

ALTER TABLE "course_service"."Quiz" DROP COLUMN "chapter_id",
DROP COLUMN "time_limit";

-- Drop tables
DROP TABLE "course_service"."Forum";
DROP TABLE "course_service"."LessonStatus";
DROP TABLE "course_service"."Message";

-- DropEnum
DROP TYPE "course_service"."LessonType";

-- CreateIndex (keep all as-is)
CREATE UNIQUE INDEX "ChapterItem_lesson_id_key" ON "course_service"."ChapterItem"("lesson_id");
CREATE UNIQUE INDEX "ChapterItem_quiz_id_key" ON "course_service"."ChapterItem"("quiz_id");
CREATE UNIQUE INDEX "ChapterItem_lab_id_key" ON "course_service"."ChapterItem"("lab_id");
CREATE INDEX "idx_chapter_item_chapter" ON "course_service"."ChapterItem"("chapter_id");
CREATE UNIQUE INDEX "ChapterItem_chapter_id_sort_order_key" ON "course_service"."ChapterItem"("chapter_id", "sort_order");
CREATE INDEX "idx_chapter_item_status_user_updated" ON "course_service"."ChapterItemStatus"("user_id", "updated_at" DESC);
CREATE INDEX "idx_chapter_item_status_item" ON "course_service"."ChapterItemStatus"("chapter_item_id");
CREATE UNIQUE INDEX "ChapterItemStatus_user_id_chapter_item_id_key" ON "course_service"."ChapterItemStatus"("user_id", "chapter_item_id");

-- AddForeignKey (keep all as-is)
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "course_service"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_service"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "course_service"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "course_service"."Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_service"."ChapterItemStatus" ADD CONSTRAINT "ChapterItemStatus_chapter_item_id_fkey" FOREIGN KEY ("chapter_item_id") REFERENCES "course_service"."ChapterItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- XOR constraint: exactly one of lesson_id, quiz_id, lab_id must be set
ALTER TABLE "course_service"."ChapterItem"
ADD CONSTRAINT chk_xor_item
CHECK (
  (lesson_id IS NOT NULL)::int +
  (quiz_id IS NOT NULL)::int +
  (lab_id IS NOT NULL)::int = 1
);