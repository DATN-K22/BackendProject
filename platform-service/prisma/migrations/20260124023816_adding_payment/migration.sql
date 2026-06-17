-- =========================================
-- 1. Ensure schema exists
-- =========================================
CREATE SCHEMA IF NOT EXISTS "media_service";

-- =========================================
-- 2. ENUMS
-- =========================================

-- ResourceType
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'ResourceType'
          AND n.nspname = 'media_service'
    ) THEN
        CREATE TYPE "media_service"."ResourceType" AS ENUM ('video', 'document');
    END IF;
END$$;

-- Add 'image'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'ResourceType'
          AND n.nspname = 'media_service'
          AND e.enumlabel = 'image'
    ) THEN
        ALTER TYPE "media_service"."ResourceType" ADD VALUE 'image';
    END IF;
END$$;

-- PaymentStatus
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'PaymentStatus'
          AND n.nspname = 'media_service'
    ) THEN
        CREATE TYPE "media_service"."PaymentStatus" AS ENUM (
            'PENDING',
            'PAID',
            'CANCELLED',
            'FAILED'
        );
    END IF;
END$$;

-- JobStatus
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'JobStatus'
          AND n.nspname = 'media_service'
    ) THEN
        CREATE TYPE "media_service"."JobStatus" AS ENUM (
            'PENDING',
            'DONE',
            'DEAD'
        );
    END IF;
END$$;

-- =========================================
-- 3. Resource
-- =========================================

CREATE TABLE IF NOT EXISTS "media_service"."Resource" (
    "id" BIGSERIAL PRIMARY KEY,
    "title" VARCHAR(255) NOT NULL,
    "type" "media_service"."ResourceType" NOT NULL,
    "thumb" VARCHAR(500),
    "link" VARCHAR(500),
    "manifest_url" VARCHAR(500),
    "path" VARCHAR(255),
    "filename" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "lesson_id" BIGINT
);

-- Ensure new columns exist
ALTER TABLE "media_service"."Resource"
    ADD COLUMN IF NOT EXISTS "path" VARCHAR(255),
    ADD COLUMN IF NOT EXISTS "filename" VARCHAR(255);

-- Backfill
UPDATE "media_service"."Resource"
SET 
    path = COALESCE(path, link, 'unknown'),
    filename = COALESCE(filename, 'unknown')
WHERE path IS NULL OR filename IS NULL;

-- Enforce NOT NULL
ALTER TABLE "media_service"."Resource"
    ALTER COLUMN "path" SET NOT NULL,
    ALTER COLUMN "filename" SET NOT NULL;

-- Align Prisma (lesson_id nullable)
ALTER TABLE "media_service"."Resource"
    ALTER COLUMN "lesson_id" DROP NOT NULL;

-- =========================================
-- 4. WatchingProgress
-- =========================================

CREATE TABLE IF NOT EXISTS "media_service"."WatchingProgress" (
    "user_id" TEXT NOT NULL,
    "resource_id" BIGINT NOT NULL,
    "is_opened" BOOLEAN NOT NULL DEFAULT false,
    "last_watch" TIMESTAMPTZ,
    PRIMARY KEY ("user_id", "resource_id")
);

-- FK (safe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'WatchingProgress_resource_id_fkey'
          AND n.nspname = 'media_service'
    ) THEN
        ALTER TABLE "media_service"."WatchingProgress"
        ADD CONSTRAINT "WatchingProgress_resource_id_fkey"
        FOREIGN KEY ("resource_id")
        REFERENCES "media_service"."Resource"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END$$;

-- =========================================
-- 5. PaymentRecord
-- =========================================

CREATE TABLE IF NOT EXISTS "media_service"."PaymentRecord" (
    "id" TEXT PRIMARY KEY,
    "orderCode" TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "media_service"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "rawWebhook" JSONB,
    "courseId" TEXT NOT NULL,
    "paidAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

-- =========================================
-- 6. EnrollJob
-- =========================================

CREATE TABLE IF NOT EXISTS "media_service"."EnrollJob" (
    "id" TEXT PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "status" "media_service"."JobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL
);

-- FK (safe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE c.conname = 'EnrollJob_paymentId_fkey'
          AND n.nspname = 'media_service'
    ) THEN
        ALTER TABLE "media_service"."EnrollJob"
        ADD CONSTRAINT "EnrollJob_paymentId_fkey"
        FOREIGN KEY ("paymentId")
        REFERENCES "media_service"."PaymentRecord"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END$$;