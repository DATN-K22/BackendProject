import { Inject, Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisCacheService {
  private readonly PREFIX = 'course:cache:'

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value) // <-- fix ở đây
    if (ttl) {
      await this.redis.set(key, serialized, 'EX', ttl)
    } else {
      await this.redis.set(key, serialized)
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key)
    if (!value) return null
    return JSON.parse(value) as T
  }

  async del(key: string): Promise<void> {
    await this.redis.del(`${this.PREFIX}${key}`)
  }
}
