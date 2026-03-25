-- CreateEnum
CREATE TYPE "course_service"."LessonType" AS ENUM ('video', 'quiz', 'assignment', 'lab');

-- AlterTable
ALTER TABLE "course_service"."Lesson" ADD COLUMN     "type" "course_service"."LessonType" NOT NULL DEFAULT 'video';

-- CreateTable
CREATE TABLE "course_service"."LessonStatus" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "lesson_id" BIGINT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "LessonStatus_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "course_service"."LessonStatus" ADD CONSTRAINT "LessonStatus_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_service"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
