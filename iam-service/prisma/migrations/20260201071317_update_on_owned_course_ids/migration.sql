/*
  Warnings:

  - You are about to drop the column `owned_course_ids` on the `Users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "iam_service"."Users" DROP COLUMN "owned_course_ids";
