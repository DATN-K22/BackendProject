/*
  Warnings:

  - A unique constraint covering the columns `[user_id,lesson_id]` on the table `LessonStatus` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "course_service"."Lesson" ADD COLUMN     "duration" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "LessonStatus_user_id_lesson_id_key" ON "course_service"."LessonStatus"("user_id", "lesson_id");
