/*
  Warnings:

  - A unique constraint covering the columns `[finish]` on the table `QuizSession` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "QuizSession_finish_key" ON "course_service"."QuizSession"("finish");
