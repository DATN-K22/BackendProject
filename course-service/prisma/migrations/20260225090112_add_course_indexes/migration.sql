-- AlterTable
ALTER TABLE "course_service"."LessonStatus" ADD COLUMN     "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "idx_chapter_course" ON "course_service"."Chapter"("course_id");

-- CreateIndex
CREATE INDEX "idx_lesson_chapter" ON "course_service"."Lesson"("chapter_id");

-- CreateIndex
CREATE INDEX "idx_lesson_status_user_updated" ON "course_service"."LessonStatus"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_lesson_status_lesson" ON "course_service"."LessonStatus"("lesson_id");
