-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "iam_service";

-- CreateEnum
CREATE TYPE "iam_service"."UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "iam_service"."EventStatus" AS ENUM ('CONFIRMED', 'TENTATIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "iam_service"."Users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "avt_url" TEXT,
    "role" "iam_service"."UserRole" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owned_course_ids" BIGINT[] DEFAULT ARRAY[]::BIGINT[],
    "enroll_course" BIGINT[] DEFAULT ARRAY[]::BIGINT[],

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_service"."Skill" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_service"."UserSkill" (
    "user_id" UUID NOT NULL,
    "skill_id" BIGINT NOT NULL,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("user_id","skill_id")
);

-- CreateTable
CREATE TABLE "iam_service"."Event" (
    "id" BIGSERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "location" VARCHAR(255),
    "status" "iam_service"."EventStatus" NOT NULL DEFAULT 'CONFIRMED',
    "time_start" TIMESTAMPTZ NOT NULL,
    "time_end" TIMESTAMPTZ NOT NULL,
    "timezone" VARCHAR(50) DEFAULT 'UTC',
    "rrule_string" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "recurrence_id" TIMESTAMPTZ,
    "original_event_id" BIGINT,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iam_service"."EventExceptionDate" (
    "id" BIGSERIAL NOT NULL,
    "event_id" BIGINT NOT NULL,
    "exception_date" DATE NOT NULL,
    "reason" VARCHAR(255),

    CONSTRAINT "EventExceptionDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "iam_service"."Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "iam_service"."Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Event_uid_key" ON "iam_service"."Event"("uid");

-- AddForeignKey
ALTER TABLE "iam_service"."UserSkill" ADD CONSTRAINT "UserSkill_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam_service"."Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_service"."UserSkill" ADD CONSTRAINT "UserSkill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "iam_service"."Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_service"."Event" ADD CONSTRAINT "Event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam_service"."Users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_service"."Event" ADD CONSTRAINT "Event_original_event_id_fkey" FOREIGN KEY ("original_event_id") REFERENCES "iam_service"."Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iam_service"."EventExceptionDate" ADD CONSTRAINT "EventExceptionDate_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "iam_service"."Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
