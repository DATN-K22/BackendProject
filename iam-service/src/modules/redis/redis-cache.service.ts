import { Inject, Injectable } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisCacheService {
  private readonly PREFIX = 'iam:cache:'

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(`${this.PREFIX}${key}`)
    return data ? JSON.parse(data) : null
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value)
    if (ttlSeconds) {
      await this.redis.set(`${this.PREFIX}${key}`, serialized, 'EX', ttlSeconds)
    } else {
      await this.redis.set(`${this.PREFIX}${key}`, serialized)
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(`${this.PREFIX}${key}`)
  }
}
