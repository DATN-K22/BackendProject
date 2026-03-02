/*
  Warnings:

  - You are about to drop the column `enrollments` on the `Course` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `LessonStatus` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "course_service"."Course" DROP COLUMN "enrollments";

-- AlterTable
ALTER TABLE "course_service"."LessonStatus" DROP COLUMN "status";

-- CreateTable
CREATE TABLE "course_service"."Enrollment" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "enrolled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complete_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_enrollment_user_enrolled" ON "course_service"."Enrollment"("user_id", "enrolled_at" DESC);

-- CreateIndex
CREATE INDEX "idx_enrollment_course" ON "course_service"."Enrollment"("course_id");

-- AddForeignKey
ALTER TABLE "course_service"."Enrollment" ADD CONSTRAINT "Enrollment_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_service"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
