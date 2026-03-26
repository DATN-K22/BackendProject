import { Injectable } from "@nestjs/common";
import { CourseService } from "./course.service";
import { LessonService } from "../lesson/lesson.service";
import { ChapterService } from "../chapter/chapter.service";
import { Tool } from "@rekog/mcp-nest";
import z from "zod";
import { stringify } from "yaml";
import { PrismaService } from "../prisma/prisma.service";




@Injectable()
export class CourseTool{
    constructor(private readonly courseService: CourseService,
                private readonly lessonsService: LessonService,
                private readonly chapterService: ChapterService,
                private readonly prismaService: PrismaService
    ){}

    @Tool({
        name: "find-course-by-fulltextsearch",
        description: "Search for courses by a keyword. Matches against course title and short description.",
        parameters: z.object({
            query: z.string().describe("The keyword to search for"),
            offset: z.number().int().min(0).default(0),
            limit: z.number().int().min(1).max(50).default(10),
        })
    })
    async fetchCourseByText({ query, offset, limit }: { query: string; offset: number; limit: number }, context: any, req: any) {
        const courses = await this.prismaService.fullTextSearch({
            modelName: "Course",
            query,
            limit,
            offset,
        });
        return {
            content: [{ type: "text", text: stringify(courses) }],
        };
    }


    @Tool({
        name: "fetch-course-syllabus",
        description: "Get the full syllabus (table of contents) of a course, including all chapters and lessons with progress for the current user.",
        parameters: z.object({
            courseId: z.string().describe("The numeric ID of the course"),
        })
    })
    async getCourseSyllabus({ courseId }: { courseId: string }, context: any, req: any) {
        const userId: string = req?.user?.id ?? req?.headers?.["x-user-id"];
        const syllabus = await this.chapterService.findAllChapterForTOC(courseId, userId);
        return {
            content: [{ type: "text", text: stringify(syllabus) }],
        };
    }

    @Tool({
        name: "fetch-enrolled-courses",
        description: "Fetch all courses that the current user has enrolled in, with their enrollment progress.",
        parameters: z.object({
            offset: z.number().int().min(0).default(0),
            limit: z.number().int().min(1).max(50).default(10),
        })
    })
    async fetchMyCourse({ offset, limit }: { offset: number; limit: number }, context: any, req: any) {
        const userId: string = req?.user?.id ?? req?.headers?.["x-user-id"];
        const enrollments = await this.prismaService.enrollment.findMany({
            where: { user_id: userId },
            skip: offset,
            take: limit,
            orderBy: { enrolled_at: "desc" },
            select: {
                complete_percent: true,
                enrolled_at: true,
                course: {
                    select: {
                        id: true,
                        title: true,
                        short_description: true,
                        thumbnail_url: true,
                        rating: true,
                        price: true,
                        owner_id: true,
                    },
                },
            },
        });
        const result = enrollments.map(({ course, complete_percent, enrolled_at }) => ({
            ...course,
            progress: complete_percent,
            enrolled_at,
        }));
        return {
            content: [{ type: "text", text: stringify(result) }],
        };
    }


    
}