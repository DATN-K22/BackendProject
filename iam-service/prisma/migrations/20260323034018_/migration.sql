/*
  Warnings:

  - You are about to drop the column `jti` on the `RefreshToken` table. All the data in the column will be lost.
  - You are about to drop the column `replaced_by` on the `RefreshToken` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[token_hash]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "iam_service"."RefreshToken_jti_key";

-- AlterTable
ALTER TABLE "iam_service"."RefreshToken" DROP COLUMN "jti",
DROP COLUMN "replaced_by",
ADD COLUMN     "device_info" TEXT,
ADD COLUMN     "replaced_by_hash" TEXT,
ADD COLUMN     "used" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_hash_key" ON "iam_service"."RefreshToken"("token_hash");

-- CreateIndex
CREATE INDEX "RefreshToken_user_id_idx" ON "iam_service"."RefreshToken"("user_id");

-- CreateIndex
CREATE INDEX "RefreshToken_expires_at_idx" ON "iam_service"."RefreshToken"("expires_at");
