-- Bước 1: Thêm cột
ALTER TABLE "course_service"."ChapterItem" ADD COLUMN "duration" INTEGER;

-- Bước 2: Update riêng cho nhóm Lesson (Cần check title từ bảng Lesson)
UPDATE "course_service"."ChapterItem" AS ci
SET duration = CASE 
    WHEN l.title ILIKE '%introduction%' OR l.title ILIKE '%conclusion%' OR l.title ILIKE '%overview%' 
        THEN floor(random() * 301 + 900)::int
    ELSE floor(random() * 1801 + 1800)::int
END
FROM "course_service"."Lesson" AS l
WHERE ci.item_type = 'lesson' AND ci.lesson_id = l.id;

-- Bước 3: Update riêng cho nhóm Quiz (Không cần check title, chỉ random)
UPDATE "course_service"."ChapterItem" 
SET duration = floor(random() * 1801 + 1800)::int
WHERE item_type = 'quiz';

-- Bước 4: Update riêng cho nhóm Lab
UPDATE "course_service"."ChapterItem" 
SET duration = floor(random() * 3601 + 3600)::int
WHERE item_type = 'lab';

-- Bước 5: Gán giá trị 0 cho các loại khác (nếu có)
UPDATE "course_service"."ChapterItem" 
SET duration = 0
WHERE item_type NOT IN ('lesson', 'quiz', 'lab') OR item_type IS NULL;