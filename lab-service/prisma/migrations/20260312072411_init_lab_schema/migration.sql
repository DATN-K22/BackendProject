-- CreateEnum
CREATE TYPE "lab_service"."LabType" AS ENUM ('ec2', 's3', 'lambda', 'database');

-- CreateEnum
CREATE TYPE "lab_service"."LabMode" AS ENUM ('tutorial', 'challenge');

-- CreateEnum
CREATE TYPE "lab_service"."LabSessionStatus" AS ENUM ('provisioning', 'ready', 'finished', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "lab_service"."LabAccountStatus" AS ENUM ('available', 'in_use', 'cleanup', 'error');

-- CreateTable
CREATE TABLE "lab_service"."Lab" (
    "id" BIGSERIAL NOT NULL,
    "lesson_id" BIGINT NOT NULL,
    "lab_type" "lab_service"."LabType" NOT NULL,
    "tutorial_cfn_script" TEXT,
    "challenge_cfn_script" TEXT,
    "tutorial_instructions" TEXT,
    "challenge_instructions" TEXT,
    "tutorial_duration_mins" INTEGER NOT NULL DEFAULT 60,
    "challenge_duration_mins" INTEGER NOT NULL DEFAULT 90,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Lab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_service"."LabSession" (
    "id" BIGSERIAL NOT NULL,
    "lab_id" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode" "lab_service"."LabMode" NOT NULL,
    "status" "lab_service"."LabSessionStatus" NOT NULL DEFAULT 'provisioning',
    "aws_account_id" VARCHAR(20) NOT NULL,
    "aws_role_arn" VARCHAR(255) NOT NULL,
    "aws_session_name" VARCHAR(255) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "score" INTEGER,
    "is_passed" BOOLEAN,

    CONSTRAINT "LabSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_service"."LabAccount" (
    "id" BIGSERIAL NOT NULL,
    "account_id" VARCHAR(20) NOT NULL,
    "role_arn" VARCHAR(255) NOT NULL,
    "status" "lab_service"."LabAccountStatus" NOT NULL DEFAULT 'available',
    "assigned_session_id" BIGINT,
    "last_cleanup_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lab_lesson_id_key" ON "lab_service"."Lab"("lesson_id");

-- CreateIndex
CREATE INDEX "idx_lab_session_user" ON "lab_service"."LabSession"("user_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_lab_session_lab" ON "lab_service"."LabSession"("lab_id");

-- CreateIndex
CREATE INDEX "idx_lab_session_status" ON "lab_service"."LabSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LabAccount_account_id_key" ON "lab_service"."LabAccount"("account_id");

-- CreateIndex
CREATE INDEX "idx_lab_account_status" ON "lab_service"."LabAccount"("status");

-- AddForeignKey
ALTER TABLE "lab_service"."LabSession" ADD CONSTRAINT "LabSession_lab_id_fkey" FOREIGN KEY ("lab_id") REFERENCES "lab_service"."Lab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
