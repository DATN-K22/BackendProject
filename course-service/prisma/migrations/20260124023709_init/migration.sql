-- CreateEnum
CREATE TYPE "course_service"."ContentStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "course_service"."Course" (
    "id" BIGSERIAL NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "thumbnail_url" VARCHAR(255),
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrollments" TEXT[],

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Skill" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."CourseSkill" (
    "course_id" BIGINT NOT NULL,
    "skill_id" BIGINT NOT NULL,

    CONSTRAINT "CourseSkill_pkey" PRIMARY KEY ("course_id","skill_id")
);

-- CreateTable
CREATE TABLE "course_service"."Chapter" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT,
    "resource_id" BIGINT,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "price" DECIMAL(10,2),
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'draft',
    "sort_order" INTEGER,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Lesson" (
    "id" BIGSERIAL NOT NULL,
    "chapter_id" BIGINT NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "thumbnail_url" VARCHAR(255),
    "status" "course_service"."ContentStatus" NOT NULL DEFAULT 'published',
    "sort_order" INTEGER,
    "resources" BIGINT[],

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Forum" (
    "id" BIGSERIAL NOT NULL,
    "course_id" BIGINT NOT NULL,
    "short_description" VARCHAR(255),
    "long_description" TEXT,
    "thumbnail_url" VARCHAR(255),

    CONSTRAINT "Forum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_service"."Message" (
    "id" BIGSERIAL NOT NULL,
    "forum_id" BIGINT NOT NULL,
    "user_id" BIGINT,
    "parent_message_id" BIGINT,
    "content" TEXT NOT NULL,
    "open_time" TIMESTAMPTZ,
    "closed_time" TIMESTAMPTZ,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Skill_name_key" ON "course_service"."Skill"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Forum_course_id_key" ON "course_service"."Forum"("course_id");

-- AddForeignKey
ALTER TABLE "course_service"."CourseSkill" ADD CONSTRAINT "CourseSkill_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_service"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."CourseSkill" ADD CONSTRAINT "CourseSkill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "course_service"."Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."Chapter" ADD CONSTRAINT "Chapter_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_service"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."Lesson" ADD CONSTRAINT "Lesson_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "course_service"."Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."Forum" ADD CONSTRAINT "Forum_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course_service"."Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."Message" ADD CONSTRAINT "Message_forum_id_fkey" FOREIGN KEY ("forum_id") REFERENCES "course_service"."Forum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_service"."Message" ADD CONSTRAINT "Message_parent_message_id_fkey" FOREIGN KEY ("parent_message_id") REFERENCES "course_service"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
