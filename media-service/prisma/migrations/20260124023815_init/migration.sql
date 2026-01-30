-- CreateEnum
CREATE TYPE "media_service"."ResourceType" AS ENUM ('video', 'document');

-- CreateTable
CREATE TABLE "media_service"."Resource" (
    "id" BIGSERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "type" "media_service"."ResourceType" NOT NULL,
    "thumb" VARCHAR(500),
    "link" VARCHAR(500),
    "manifest_url" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "lesson_id" BIGINT NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_service"."WatchingProgress" (
    "user_id" TEXT NOT NULL,
    "resource_id" BIGINT NOT NULL,
    "is_opened" BOOLEAN NOT NULL DEFAULT false,
    "last_watch" TIMESTAMPTZ,

    CONSTRAINT "WatchingProgress_pkey" PRIMARY KEY ("user_id","resource_id")
);

-- AddForeignKey
ALTER TABLE "media_service"."WatchingProgress" ADD CONSTRAINT "WatchingProgress_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "media_service"."Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
