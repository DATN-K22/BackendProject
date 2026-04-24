/*
  Warnings:

  - You are about to drop the column `long_description` on the `Chapter` table. All the data in the column will be lost.
  - You are about to drop the column `short_description` on the `Chapter` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "course_service"."Chapter" DROP COLUMN "long_description",
DROP COLUMN "short_description";

-- CreateTable
CREATE TABLE "course_service"."Quiz" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "time_limit" INTEGER NOT NULL,
    "description" TEXT,
    "chapter_id" BIGINT NOT NULL,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."QuizQuestion" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "question_text" TEXT NOT NULL,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."QuizOption" (
    "id" BIGSERIAL NOT NULL,
    "quiz_question_id" BIGINT NOT NULL,
    "option_text" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "QuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."QuizSession" (
    "id" BIGSERIAL NOT NULL,
    "quiz_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "finish" BOOLEAN NOT NULL DEFAULT false,
    "rightQuestions" INTEGER NOT NULL DEFAULT 0,
    "questionOrder" BIGINT[],

    CONSTRAINT "QuizSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_quiz_chapter" ON "course_service"."Quiz"("chapter_id");

-- CreateIndex
CREATE INDEX "idx_quiz_question_quiz" ON "course_service"."QuizQuestion"("quiz_id");

-- CreateIndex
CREATE INDEX "idx_quiz_option_question" ON "course_service"."QuizOption"("quiz_question_id");

-- CreateIndex
CREATE INDEX "idx_quiz_session_user_started" ON "course_service"."QuizSession"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_quiz_session_quiz" ON "course_service"."QuizSession"("quiz_id");

-- AddForeignKey
ALTER TABLE "course_service"."Quiz" ADD CONSTRAINT "Quiz_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "course_service"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."QuizQuestion" ADD CONSTRAINT "QuizQuestion_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "course_service"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."QuizOption" ADD CONSTRAINT "QuizOption_quiz_question_id_fkey" FOREIGN KEY ("quiz_question_id") REFERENCES "course_service"."QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."QuizSession" ADD CONSTRAINT "QuizSession_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "course_service"."Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
