import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient, Prisma } from '@prisma/client'

export interface FtsOptions {
  modelName: Prisma.ModelName
  schemaName?: string
  tableName?: string
  vectorColumn?: string
  query: string
  lang?: string
  limit?: number
  offset?: number
  minRank?: number
}

interface FtsResult<T> {
  data: T[]
  total?: number // NEW: Optional total count for pagination
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // Whitelists for security
  private readonly ALLOWED_LANGUAGES = ['simple', 'english', 'vietnamese']
  private readonly ALLOWED_SCHEMAS = ['public', 'course_service']
  private readonly ALLOWED_VECTOR_COLUMNS = ['fts_vector', 'search_vector']

  constructor() {
    super({
      log: ['warn', 'error']
    })
  }

  async onModuleInit() {
    await this.$connect()
  }

  /**
   * Full Text Search with improved security and features
   */
  async fullTextSearch<T = any>(options: FtsOptions): Promise<T[]> {
    const {
      modelName,
      schemaName = 'course_service',
      tableName,
      query,
      lang = 'english',
      limit = 10,
      offset = 0
    } = options

    this.validateFtsOptions(modelName, schemaName, lang)

    if (!query || query.trim() === '') {
      return []
    }

    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100')
    }

    if (offset < 0) {
      throw new Error('Offset must be non-negative')
    }

    const finalTableName = tableName || modelName
    const fullTablePath = `"${schemaName}"."${finalTableName}"`

    const sql = `
      SELECT 
        t.id::text, 
        t.owner_id, 
        t.title, 
        t.short_description, 
        t.long_description, 
        t.price, 
        t.status, 
        t.created_at, 
        t.course_level,
        t.rating, 
        t.language,
        t.thumbnail_url,
        -- Calculate relevance score based on field priority
        CASE 
          WHEN t.title IS NOT NULL AND t.title ILIKE $2 THEN 3.0
          WHEN t.long_description IS NOT NULL AND t.long_description ILIKE $2 THEN 2.0
          WHEN t.short_description IS NOT NULL AND t.short_description ILIKE $2 THEN 1.5
          ELSE 0.5
        END as relevance_score
      FROM ${fullTablePath} t
      WHERE 
        t.title ILIKE $2
        OR t.long_description ILIKE $2
        OR t.short_description ILIKE $2
      ORDER BY 
        relevance_score DESC,
        t.created_at DESC
      LIMIT $3 OFFSET $4
    `

    return this.$queryRawUnsafe<T[]>(
      sql,
      lang, // $1 - not used in ILIKE, but kept for consistency
      '%' + query + '%', // $2 - wrapped with % for ILIKE
      limit, // $3
      offset // $4
    )
  }
  /**
   * Full Text Search with total count (for pagination)
   */
  async fullTextSearchWithCount<T = any>(options: FtsOptions): Promise<FtsResult<T>> {
    const {
      modelName,
      schemaName = 'course_service',
      tableName,
      query,
      lang = 'english',
      limit = 10,
      offset = 0
    } = options

    this.validateFtsOptions(modelName, schemaName, lang)

    if (!query || query.trim() === '') {
      return { data: [], total: 0 }
    }

    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100')
    }

    if (offset < 0) {
      throw new Error('Offset must be non-negative')
    }

    const finalTableName = tableName || modelName
    const fullTablePath = `"${schemaName}"."${finalTableName}"`

    const dataSQL = `
      SELECT 
        t.id::text, 
        t.owner_id, 
        t.title, 
        t.short_description, 
        t.long_description, 
        t.price, 
        t.status, 
        t.created_at, 
        t.course_level,
        t.rating, 
        t.language,
        t.thumbnail_url,
        CASE 
          WHEN t.title IS NOT NULL AND t.title ILIKE $2 THEN 3.0
          WHEN t.long_description IS NOT NULL AND t.long_description ILIKE $2 THEN 2.0
          WHEN t.short_description IS NOT NULL AND t.short_description ILIKE $2 THEN 1.5
          ELSE 0.5
        END as relevance_score
      FROM ${fullTablePath} t
      WHERE 
        t.title ILIKE $2
        OR t.long_description ILIKE $2
        OR t.short_description ILIKE $2
      ORDER BY 
        relevance_score DESC,
        t.created_at DESC
      LIMIT $3 OFFSET $4
    `

    const countSQL = `
      SELECT COUNT(*) as total
      FROM ${fullTablePath} t
      WHERE 
        t.title ILIKE $2
        OR t.long_description ILIKE $2
        OR t.short_description ILIKE $2
    `

    const [data, countResult] = await Promise.all([
      this.$queryRawUnsafe<T[]>(dataSQL, lang, '%' + query + '%', limit, offset),
      this.$queryRawUnsafe<[{ total: bigint }]>(countSQL, lang, '%' + query + '%')
    ])

    return {
      data,
      total: Number(countResult[0]?.total || 0)
    }
  }

  /**
   * Validate FTS options for security
   */
  private validateFtsOptions(modelName: any, schemaName: string, lang: string): void {
    if (!Object.values(Prisma.ModelName).includes(modelName)) {
      throw new Error(`Invalid model name: ${modelName}`)
    }

    if (!this.ALLOWED_SCHEMAS.includes(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`)
    }

    if (!this.ALLOWED_LANGUAGES.includes(lang)) {
      throw new Error(`Invalid language: ${lang}. Allowed: ${this.ALLOWED_LANGUAGES.join(', ')}`)
    }
  }
}
