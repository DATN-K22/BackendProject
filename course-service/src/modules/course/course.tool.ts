import { Injectable } from '@nestjs/common'
import { CourseService } from './course.service'
import { LessonService } from '../lesson/lesson.service'
import { ChapterService } from '../chapter/chapter.service'
import { Tool } from '@rekog/mcp-nest'
import z from 'zod'
import { stringify } from 'yaml'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class CourseTool {
  private readonly QUERY_STOP_WORDS = new Set([
    'i',
    'im',
    "i'm",
    'me',
    'my',
    'we',
    'our',
    'you',
    'your',
    'a',
    'an',
    'the',
    'and',
    'or',
    'to',
    'for',
    'of',
    'in',
    'on',
    'with',
    'about',
    'please',
    'find',
    'give',
    'show',
    'need',
    'want',
    'learn',
    'course',
    'courses',
    'that',
    'this',
    'it',
    'is',
    'are',
    'be',
    'as',
    'by',
    'from',
    'into',
    'currently'
  ])

  private readonly QUERY_CONSTRAINT_WORDS = new Set([
    'cheap',
    'fast',
    'quick',
    'beginner',
    'beginnerfriendly',
    'friendly',
    'highly',
    'rated',
    'weekend',
    'weekendonly',
    'practical',
    'handson',
    'hands',
    'exactly',
    'specific',
    'best'
  ])

  constructor(
    private readonly courseService: CourseService,
    private readonly lessonsService: LessonService,
    private readonly chapterService: ChapterService,
    private readonly prismaService: PrismaService
  ) {}

  private normalizeText(value?: string | null) {
    return (value ?? '').toLowerCase().trim()
  }

  private toNumber(value: unknown, fallback = 0): number {
    if (typeof value === 'number') return value
    if (typeof value === 'bigint') return Number(value)
    if (value && typeof (value as any).toNumber === 'function') {
      return (value as any).toNumber()
    }
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private buildSearchSuggestions(query: string) {
    const normalized = this.normalizeText(query)
    const quoted = this.extractQuotedPhrases(query)
    const relaxed = this.buildRelaxedQueries(query)
    const tokens = this.tokenizeQuery(query)
      .filter((token) => !this.QUERY_STOP_WORDS.has(token))
      .slice(0, 6)

    const candidates = new Set<string>()

    quoted.forEach((phrase) => candidates.add(phrase))
    relaxed.forEach((phrase) => candidates.add(phrase))

    if (tokens.length >= 2) {
      candidates.add(tokens.slice(0, 2).join(' '))
      candidates.add(tokens.slice(0, 3).join(' '))
    }
    if (tokens.length >= 4) {
      candidates.add(tokens.slice(1, 4).join(' '))
    }

    if (normalized.includes('aws')) {
      candidates.add(`aws ${tokens.slice(0, 3).join(' ').trim()}`.trim())
    }

    return [...candidates]
      .filter((item) => item.length > 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, 5)
  }

  private heuristicScore(course: any, query: string): number {
    const title = this.normalizeText(course.title)
    const desc = this.normalizeText(course.short_description)
    const text = `${title} ${desc}`.trim()
    const queryNormalized = this.normalizeText(query)
    const queryTokens = this.tokenizeQuery(query).filter(
      (token) => !this.QUERY_STOP_WORDS.has(token) && !this.QUERY_CONSTRAINT_WORDS.has(token)
    )
    const textTokens = new Set(this.tokenizeQuery(text))
    const quotedPhrases = this.extractQuotedPhrases(query)

    const overlapCount = queryTokens.reduce((sum, token) => sum + (textTokens.has(token) ? 1 : 0), 0)
    const overlapRatio = queryTokens.length > 0 ? overlapCount / queryTokens.length : 0

    let score = this.toNumber(course.rank, 0) * 100
    score += this.toNumber(course.rating, 0) * 6
    score += overlapRatio * 40

    if (queryNormalized.length > 4 && text.includes(queryNormalized)) {
      score += 15
    }

    const phraseMatches = quotedPhrases.filter((phrase) => text.includes(this.normalizeText(phrase))).length
    score += Math.min(phraseMatches * 8, 24)

    return Math.round(score * 100) / 100
  }

  private toCourseView(course: any, query: string) {
    return {
      id: String(course.id),
      title: course.title,
      short_description: course.short_description,
      rating: this.toNumber(course.rating),
      price: this.toNumber(course.price),
      course_level: course.course_level,
      relevance_score: this.toNumber(course.rank),
      heuristic_score: this.heuristicScore(course, query)
    }
  }

  private tokenizeQuery(query: string) {
    return this.normalizeText(query)
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter((token) => token.length > 2)
  }

  private extractQuotedPhrases(query: string) {
    const matches = query.match(/"([^"]+)"|'([^']+)'/g) ?? []
    return matches
      .map((raw) => raw.replace(/^['"]|['"]$/g, '').trim())
      .filter((phrase) => phrase.length > 2)
      .map((phrase) => this.normalizeText(phrase))
  }

  private buildNGrams(tokens: string[], minSize: number, maxSize: number) {
    const grams: string[] = []
    for (let size = Math.min(maxSize, tokens.length); size >= minSize; size--) {
      for (let i = 0; i <= tokens.length - size; i++) {
        grams.push(tokens.slice(i, i + size).join(' '))
      }
    }
    return grams
  }

  private buildRelaxedQueries(query: string) {
    const baseTokens = this.tokenizeQuery(query)
    const quotedPhrases = this.extractQuotedPhrases(query)
    const topicTokens = baseTokens.filter(
      (token) => !this.QUERY_STOP_WORDS.has(token) && !this.QUERY_CONSTRAINT_WORDS.has(token)
    )
    const fallbackTokens = baseTokens.filter((token) => !this.QUERY_STOP_WORDS.has(token))
    const candidates = new Set<string>()

    const normalizedOriginal = this.normalizeText(query)
    if (normalizedOriginal) {
      candidates.add(normalizedOriginal)
    }

    quotedPhrases.forEach((phrase) => candidates.add(phrase))

    if (topicTokens.length > 0) {
      candidates.add(topicTokens.join(' '))
      this.buildNGrams(topicTokens, 2, 4).forEach((phrase) => candidates.add(phrase))
      topicTokens
        .slice()
        .sort((a, b) => b.length - a.length)
        .slice(0, 4)
        .forEach((token) => candidates.add(token))
    }

    if (fallbackTokens.length > 0) {
      candidates.add(fallbackTokens.slice(0, 5).join(' '))
    }

    if (baseTokens.includes('aws')) candidates.add('aws')
    if (baseTokens.includes('amazon')) candidates.add('amazon')

    return [...candidates]
      .filter((candidate) => candidate.length > 1)
      .sort((a, b) => b.length - a.length)
      .slice(0, 8)
  }

  @Tool({
    name: 'find-course-by-fulltextsearch',
    description:
      'Search courses by keyword against title and short_description. Supports optional filters and deterministic sort for better course selection.',
    parameters: z.object({
      query: z.string().describe('The keyword to search for'),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(50).default(10),
      minRating: z.number().min(0).max(5).optional().describe('Optional minimum rating filter'),
      maxPrice: z.number().min(0).optional().describe('Optional maximum price filter'),
      courseLevel: z
        .enum(['Beginner', 'Intermediate', 'Advanced', 'Expert', 'AllLevels'])
        .optional()
        .describe('Optional exact course level filter'),
      sortBy: z
        .enum(['relevance', 'rating', 'price', 'heuristic'])
        .default('heuristic')
        .describe('Sort strategy for the final result list'),
      includeSuggestions: z
        .boolean()
        .default(true)
        .describe('When true, include suggested follow-up queries if result is empty')
    })
  })
  async fetchCourseByText(
    {
      query,
      offset,
      limit,
      minRating,
      maxPrice,
      courseLevel,
      sortBy,
      includeSuggestions
    }: {
      query: string
      offset: number
      limit: number
      minRating?: number
      maxPrice?: number
      courseLevel?: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert' | 'AllLevels'
      sortBy?: 'relevance' | 'rating' | 'price' | 'heuristic'
      includeSuggestions?: boolean
    },
    context: any,
    req: any
  ) {
    const fetchLimit = Math.min(Math.max(limit * 4, 20), 100)
    const courses = await this.prismaService.fullTextSearch<any>({
      modelName: 'Course',
      query,
      limit: fetchLimit,
      offset
    })

    const filtered = courses
      .filter((course) => {
        const rating = this.toNumber(course.rating)
        const price = this.toNumber(course.price)
        if (typeof minRating === 'number' && rating < minRating) return false
        if (typeof maxPrice === 'number' && price > maxPrice) return false
        if (courseLevel && course.course_level !== courseLevel) return false
        return true
      })
      .map((course) => this.toCourseView(course, query))

    const finalSortBy = sortBy ?? 'heuristic'
    filtered.sort((a, b) => {
      if (finalSortBy === 'rating') return b.rating - a.rating
      if (finalSortBy === 'price') return a.price - b.price
      if (finalSortBy === 'relevance') return b.relevance_score - a.relevance_score
      return b.heuristic_score - a.heuristic_score
    })

    let result = filtered.slice(0, limit)
    let fallbackUsed = false

    if (result.length === 0) {
      const relaxedQueries = this.buildRelaxedQueries(query)
      for (const relaxedQuery of relaxedQueries) {
        const relaxedCourses = await this.prismaService.fullTextSearch<any>({
          modelName: 'Course',
          query: relaxedQuery,
          limit: fetchLimit,
          offset: 0
        })

        const relaxedMapped = relaxedCourses
          .map((course) => this.toCourseView(course, relaxedQuery))
          .sort((a, b) => b.heuristic_score - a.heuristic_score)
          .slice(0, limit)

        if (relaxedMapped.length > 0) {
          result = relaxedMapped
          fallbackUsed = true
          break
        }
      }
    }

    const isEmpty = result.length === 0
    const bestMatch = result[0] ?? null

    return {
      content: [
        {
          type: 'text',
          text: stringify({
            query,
            filters: {
              minRating: minRating ?? null,
              maxPrice: maxPrice ?? null,
              courseLevel: courseLevel ?? null
            },
            sortBy: finalSortBy,
            returned_count: result.length,
            candidates_count: filtered.length,
            status: isEmpty ? 'empty' : 'ok',
            message: isEmpty
              ? 'No courses found with current filters. Try relaxing filters or using suggested queries.'
              : null,
            fallback_used: fallbackUsed,
            best_match: bestMatch,
            suggested_queries: isEmpty && (includeSuggestions ?? true) ? this.buildSearchSuggestions(query) : [],
            items: result
          })
        }
      ]
    }
  }

  @Tool({
    name: 'fetch-course-syllabus',
    description:
      'Get syllabus for a course. Use includeLessons=false for a token-light summary (chapter counts + first/last lesson titles).',
    parameters: z.object({
      courseId: z.string().describe('The numeric ID of the course'),
      includeLessons: z
        .boolean()
        .default(true)
        .describe('Return full lesson arrays when true; return chapter summary only when false'),
      chapterTitleQuery: z.string().optional().describe('Optional chapter title contains filter'),
      caseSensitive: z.boolean().default(false).describe('Whether chapterTitleQuery matching is case-sensitive'),
      maxChapters: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe('Optional max number of chapters in the response'),
      maxLessonsPerChapter: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Optional max lessons per chapter (applied only when includeLessons=true)')
    })
  })
  async getCourseSyllabus(
    {
      courseId,
      includeLessons,
      chapterTitleQuery,
      caseSensitive,
      maxChapters,
      maxLessonsPerChapter
    }: {
      courseId: string
      includeLessons: boolean
      chapterTitleQuery?: string
      caseSensitive: boolean
      maxChapters?: number
      maxLessonsPerChapter?: number
    },
    context: any,
    req: any
  ) {
    const userId: string = req?.user?.id ?? req?.headers?.['x-user-id']
    const syllabus = await this.chapterService.findAllChapterForTOC(courseId, userId)

    const normalize = (value?: string) => (caseSensitive ? (value ?? '') : this.normalizeText(value))
    const chapterNeedle = normalize(chapterTitleQuery)

    let chapters = syllabus.chapters.filter((chapter) => {
      if (!chapterNeedle) return true
      return normalize(chapter.title ?? '').includes(chapterNeedle)
    })

    if (maxChapters) {
      chapters = chapters.slice(0, maxChapters)
    }

    const result = chapters.map((chapter, chapterIndex) => {
      const allLessons = chapter.lessons.map((lesson, lessonIndex) => ({
        index: lessonIndex + 1,
        title: lesson.title,
        isFinished: lesson.isFinished,
        duration: lesson.duration ?? null
      }))

      const lessons = typeof maxLessonsPerChapter === 'number' ? allLessons.slice(0, maxLessonsPerChapter) : allLessons

      return {
        index: chapterIndex + 1,
        title: chapter.title,
        lessonCount: allLessons.length,
        firstLessonTitle: allLessons[0]?.title ?? null,
        lastLessonTitle: allLessons[allLessons.length - 1]?.title ?? null,
        lessons: includeLessons ? lessons : undefined
      }
    })

    const totalLessons = result.reduce((sum, chapter) => sum + chapter.lessonCount, 0)

    return {
      content: [
        {
          type: 'text',
          text: stringify({
            courseId,
            includeLessons,
            chapterTitleQuery: chapterTitleQuery ?? null,
            caseSensitive,
            totalChapters: result.length,
            totalLessons,
            chapters: result
          })
        }
      ]
    }
  }

  @Tool({
    name: 'find-syllabus-lecture',
    description:
      'Find lecture titles in a course syllabus by optional chapterQuery + required lectureQuery; returns first, last, or all matches with indices.',
    parameters: z.object({
      courseId: z.string().describe('The numeric ID of the course'),
      chapterQuery: z.string().optional().describe('Optional chapter keyword to narrow down search'),
      lectureQuery: z.string().describe('Lecture keyword to find'),
      mode: z.enum(['first', 'last', 'all']).default('first').describe('Which match to return'),
      caseSensitive: z.boolean().default(false).describe('Whether matching should be case-sensitive')
    })
  })
  async findSyllabusLecture(
    {
      courseId,
      chapterQuery,
      lectureQuery,
      mode,
      caseSensitive
    }: {
      courseId: string
      chapterQuery?: string
      lectureQuery: string
      mode: 'first' | 'last' | 'all'
      caseSensitive: boolean
    },
    context: any,
    req: any
  ) {
    const userId: string = req?.user?.id ?? req?.headers?.['x-user-id']
    const syllabus = await this.chapterService.findAllChapterForTOC(courseId, userId)

    const normalize = (value?: string) => (caseSensitive ? (value ?? '') : this.normalizeText(value))
    const chapterNeedle = normalize(chapterQuery)
    const lectureNeedle = normalize(lectureQuery)

    const matches: Array<{
      chapterIndex: number
      chapterTitle: string
      lessonIndex: number
      lessonTitle: string
    }> = []

    syllabus.chapters.forEach((chapter, chapterIndex) => {
      const chapterTitle = chapter.title ?? ''
      const chapterText = normalize(chapterTitle)
      if (chapterNeedle && !chapterText.includes(chapterNeedle)) {
        return
      }

      chapter.lessons.forEach((lesson, lessonIndex) => {
        const lessonTitle = lesson.title ?? ''
        const lessonText = normalize(lessonTitle)
        if (lessonText.includes(lectureNeedle)) {
          matches.push({
            chapterIndex: chapterIndex + 1,
            chapterTitle,
            lessonIndex: lessonIndex + 1,
            lessonTitle
          })
        }
      })
    })

    const selected =
      mode === 'all'
        ? matches
        : mode === 'last'
          ? matches.length
            ? [matches[matches.length - 1]]
            : []
          : matches.length
            ? [matches[0]]
            : []

    return {
      content: [
        {
          type: 'text',
          text: stringify({
            courseId,
            chapterQuery: chapterQuery ?? null,
            lectureQuery,
            mode,
            caseSensitive,
            status: matches.length === 0 ? 'empty' : 'ok',
            totalMatches: matches.length,
            matches: selected
          })
        }
      ]
    }
  }

  @Tool({
    name: 'count-lectures-in-chapter',
    description: 'Count lectures in a chapter by chapter title query. Useful when only numeric count is needed.',
    parameters: z.object({
      courseId: z.string().describe('The numeric ID of the course'),
      chapterTitleQuery: z.string().describe('Chapter title contains text'),
      caseSensitive: z.boolean().default(false).describe('Whether chapter title matching is case-sensitive'),
      exactMatch: z.boolean().default(false).describe('When true, chapter title must match exactly')
    })
  })
  async countLecturesInChapter(
    {
      courseId,
      chapterTitleQuery,
      caseSensitive,
      exactMatch
    }: {
      courseId: string
      chapterTitleQuery: string
      caseSensitive: boolean
      exactMatch: boolean
    },
    context: any,
    req: any
  ) {
    const userId: string = req?.user?.id ?? req?.headers?.['x-user-id']
    const syllabus = await this.chapterService.findAllChapterForTOC(courseId, userId)

    const normalize = (value?: string) => (caseSensitive ? (value ?? '') : this.normalizeText(value))
    const needle = normalize(chapterTitleQuery)

    const matched = syllabus.chapters
      .map((chapter, idx) => ({
        chapterIndex: idx + 1,
        chapterTitle: chapter.title,
        lessonCount: chapter.lessons.length
      }))
      .filter((chapter) => {
        const title = normalize(chapter.chapterTitle ?? '')
        return exactMatch ? title === needle : title.includes(needle)
      })

    return {
      content: [
        {
          type: 'text',
          text: stringify({
            courseId,
            chapterTitleQuery,
            caseSensitive,
            exactMatch,
            status: matched.length === 0 ? 'empty' : 'ok',
            matchedChapterCount: matched.length,
            totalLecturesAcrossMatches: matched.reduce((sum, c) => sum + c.lessonCount, 0),
            chapters: matched
          })
        }
      ]
    }
  }

  @Tool({
    name: 'fetch-enrolled-courses',
    description: 'Fetch all courses that the current user has enrolled in, with their enrollment progress.',
    parameters: z.object({
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(50).default(5)
    })
  })
  async fetchMyCourse({ offset, limit }: { offset: number; limit: number }, context: any, req: any) {
    const userId: string = req?.user?.id ?? req?.headers?.['x-user-id']
    const [enrollments, total] = await Promise.all([
      this.prismaService.enrollment.findMany({
        where: { user_id: userId },
        skip: offset,
        take: limit,
        orderBy: { enrolled_at: 'desc' },
        select: {
          complete_percent: true,
          enrolled_at: true,
          course: {
            select: {
              id: true,
              title: true,
              short_description: true
            }
          }
        }
      }),
      this.prismaService.enrollment.count({ where: { user_id: userId } })
    ])

    const result = enrollments.map(({ course, complete_percent, enrolled_at }) => ({
      ...course,
      id: String(course.id),
      progress: complete_percent,
      enrolled_at
    }))
    return {
      content: [
        {
          type: 'text',
          text: stringify({
            offset,
            limit,
            returned_count: result.length,
            total,
            has_more: offset + result.length < total,
            items: result
          })
        }
      ]
    }
  }
}
