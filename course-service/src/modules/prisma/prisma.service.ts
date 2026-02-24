import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

export interface FtsOptions {
  modelName: Prisma.ModelName;
  schemaName?: string;
  tableName?: string;
  vectorColumn?: string;
  query: string;
  lang?: string;
  limit?: number;
  offset?: number;
  minRank?: number;
}

interface FtsResult<T> {
  data: T[];
  total?: number; // NEW: Optional total count for pagination
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // Whitelists for security
  private readonly ALLOWED_LANGUAGES = ['simple', 'english', 'vietnamese'];
  private readonly ALLOWED_SCHEMAS = ['public', 'course_service'];
  private readonly ALLOWED_VECTOR_COLUMNS = ['fts_vector', 'search_vector'];

  constructor() {
    super({
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Full Text Search with improved security and features
   */
  async fullTextSearch<T = any>(options: FtsOptions): Promise<T[]> {
    const {
      modelName,
      schemaName = 'public',
      tableName,
      vectorColumn = 'fts_vector',
      query,
      lang = 'simple',
      limit = 10,
      offset = 0,
      minRank = 0, 
    } = options;


    if (!Object.values(Prisma.ModelName).includes(modelName)) {
      throw new Error(`Invalid model name: ${modelName}`);
    }

    if (!this.ALLOWED_SCHEMAS.includes(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    if (!this.ALLOWED_LANGUAGES.includes(lang)) {
      throw new Error(`Invalid language: ${lang}. Allowed: ${this.ALLOWED_LANGUAGES.join(', ')}`);
    }

    if (!this.ALLOWED_VECTOR_COLUMNS.includes(vectorColumn)) {
      throw new Error(`Invalid vector column: ${vectorColumn}`);
    }

    if (!query || query.trim() === '') {
      return [];
    }

    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    if (offset < 0) {
      throw new Error('Offset must be non-negative');
    }

    const finalTableName = tableName || modelName;
    const fullTablePath = `"${schemaName}"."${finalTableName}"`;

    const sql = `
      SELECT *, 
             ts_rank("${vectorColumn}", plainto_tsquery($1::regconfig, $2)) as rank
      FROM ${fullTablePath}
      WHERE "${vectorColumn}" @@ plainto_tsquery($1::regconfig, $2)
            AND ts_rank("${vectorColumn}", plainto_tsquery($1::regconfig, $2)) > $5
      ORDER BY rank DESC
      LIMIT $3 OFFSET $4
    `;

    return this.$queryRawUnsafe<T[]>(
      sql,
      lang,      // $1 
      query,     // $2
      limit,     // $3
      offset,    // $4
      minRank,   // $5
    );
  }

  /**
   * Full Text Search with total count (for pagination)
   */
  async fullTextSearchWithCount<T = any>(
    options: FtsOptions,
  ): Promise<FtsResult<T>> {
    const {
      modelName,
      schemaName = 'public',
      tableName,
      vectorColumn = 'fts_vector',
      query,
      lang = 'simple',
      limit = 10,
      offset = 0,
      minRank = 0,
    } = options;

    if (!Object.values(Prisma.ModelName).includes(modelName)) {
      throw new Error(`Invalid model name: ${modelName}`);
    }
    if (!this.ALLOWED_SCHEMAS.includes(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }
    if (!this.ALLOWED_LANGUAGES.includes(lang)) {
      throw new Error(`Invalid language: ${lang}`);
    }
    if (!this.ALLOWED_VECTOR_COLUMNS.includes(vectorColumn)) {
      throw new Error(`Invalid vector column: ${vectorColumn}`);
    }
    if (!query || query.trim() === '') {
      return { data: [], total: 0 };
    }

    const finalTableName = tableName || modelName;
    const fullTablePath = `"${schemaName}"."${finalTableName}"`;

    const dataSQL = `
      SELECT *, 
             ts_rank("${vectorColumn}", plainto_tsquery($1::regconfig, $2)) as rank
      FROM ${fullTablePath}
      WHERE "${vectorColumn}" @@ plainto_tsquery($1::regconfig, $2)
            AND ts_rank("${vectorColumn}", plainto_tsquery($1::regconfig, $2)) > $5
      ORDER BY rank DESC
      LIMIT $3 OFFSET $4
    `;

    const countSQL = `
      SELECT COUNT(*) as total
      FROM ${fullTablePath}
      WHERE "${vectorColumn}" @@ plainto_tsquery($1::regconfig, $2)
            AND ts_rank("${vectorColumn}", plainto_tsquery($1::regconfig, $2)) > $5
    `;

    const [data, countResult] = await Promise.all([
      this.$queryRawUnsafe<T[]>(dataSQL, lang, query, limit, offset, minRank),
      this.$queryRawUnsafe<[{ total: bigint }]>(countSQL, lang, query, minRank),
    ]);

    return {
      data,
      total: Number(countResult[0]?.total || 0),
    };
  }


}