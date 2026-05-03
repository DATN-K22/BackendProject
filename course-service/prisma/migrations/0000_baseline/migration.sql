-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "course_service";

-- CreateEnum
CREATE TYPE "course_service"."ContentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "course_service"."CourseLevel" AS ENUM ('Beginner', 'Intermediate', 'Advanced', 'Expert', 'AllLevels');

-- CreateEnum
CREATE TYPE "course_service"."ChapterItemType" AS ENUM ('lesson', 'quiz', 'lab');

-- CreateEnum
CREATE TYPE "course_service"."SkillLevel" AS ENUM ('basic', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "course_service"."QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTI_CHOICE', 'FILL_BLANK');

-- CreateTable
CREATE TABLE "course_service"."Course" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "thumbnail_url" VARCHAR(255),
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "course_level" "course_service"."CourseLevel" NOT NULL DEFAULT 'Beginner',
    "language" TEXT NOT NULL DEFAULT 'simple',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fts_vector" tsvector,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Chapter" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT,
    "resource_id" BIGINT,
    "title" VARCHAR(255) NOT NULL,
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'draft',
    "sort_order" INTEGER,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."ChapterItem" (
    "id" BIGSERIAL NOT NULL,
    "chapter_id" BIGINT NOT NULL,
    "item_type" "course_service"."ChapterItemType" NOT NULL,
    "lesson_id" BIGINT,
    "quiz_id" BIGINT,
    "lab_id" BIGINT,
    "sort_order" INTEGER NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'published',

    CONSTRAINT "ChapterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Lesson" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "thumbnail_url" VARCHAR(255),
    "resources" BIGINT[],

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Lab" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "leaseTemplateId" VARCHAR(255),
    "resources" BIGINT[],

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."ChapterItemStatus" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "chapter_item_id" BIGINT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChapterItemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Enrollment" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complete_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Quiz" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."QuizQuestion" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "question_text" TEXT NOT NULL,
    "questionType" "course_service"."QuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."QuizOption" (
    "id" BIGSERIAL NOT NULL,
    "quiz_question_id" BIGINT NOT NULL,
    "option_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."QuizSession" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "finish" BOOLEAN NOT NULL DEFAULT false,
    "rightQuestions" INTEGER NOT NULL DEFAULT 0,
    "questionOrder" BIGINT[],
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "skillEstimate" "course_service"."SkillLevel" NOT NULL DEFAULT 'basic',
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_chapter_course" ON "course_service"."Chapter"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterItem_lesson_id_key" ON "course_service"."ChapterItem"("lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterItem_quiz_id_key" ON "course_service"."ChapterItem"("quiz_id");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterItem_lab_id_key" ON "course_service"."ChapterItem"("lab_id");

-- CreateIndex
CREATE INDEX "idx_chapter_item_chapter" ON "course_service"."ChapterItem"("chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterItem_chapter_id_sort_order_key" ON "course_service"."ChapterItem"("chapter_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_chapter_item_status_user_updated" ON "course_service"."ChapterItemStatus"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_chapter_item_status_item" ON "course_service"."ChapterItemStatus"("chapter_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterItemStatus_user_id_chapter_item_id_key" ON "course_service"."ChapterItemStatus"("user_id", "chapter_item_id");

-- CreateIndex
CREATE INDEX "idx_enrollment_user_enrolled" ON "course_service"."Enrollment"("user_id", "enrolled_at" DESC);

-- CreateIndex
CREATE INDEX "idx_enrollment_course" ON "course_service"."Enrollment"("course_id");

-- CreateIndex
CREATE INDEX "idx_quiz_question_quiz" ON "course_service"."QuizQuestion"("quiz_id");

-- CreateIndex
CREATE INDEX "idx_quiz_option_question" ON "course_service"."QuizOption"("quiz_question_id");

-- CreateIndex
CREATE INDEX "idx_quiz_session_user_started" ON "course_service"."QuizSession"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_quiz_session_quiz" ON "course_service"."QuizSession"("quiz_id");

-- AddForeignKey
ALTER TABLE "course_service"."Chapter" ADD CONSTRAINT "Chapter_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_service"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "course_service"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "course_service"."Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_service"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."ChapterItem" ADD CONSTRAINT "ChapterItem_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "course_service"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."ChapterItemStatus" ADD CONSTRAINT "ChapterItemStatus_chapter_item_id_fkey" FOREIGN KEY ("chapter_item_id") REFERENCES "course_service"."ChapterItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."Enrollment" ADD CONSTRAINT "Enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_service"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."QuizQuestion" ADD CONSTRAINT "QuizQuestion_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "course_service"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."QuizOption" ADD CONSTRAINT "QuizOption_quiz_question_id_fkey" FOREIGN KEY ("quiz_question_id") REFERENCES "course_service"."QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."QuizSession" ADD CONSTRAINT "QuizSession_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "course_service"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

