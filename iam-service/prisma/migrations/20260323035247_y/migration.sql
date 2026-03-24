/*
  Warnings:

  - You are about to drop the column `replaced_by_hash` on the `RefreshToken` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "iam_service"."RefreshToken" DROP COLUMN "replaced_by_hash";
