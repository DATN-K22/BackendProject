import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService {
  private readonly PREFIX = 'iam:cache:';

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(`${this.PREFIX}${key}`);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds !== undefined) {
      await this.redis.set(`${this.PREFIX}${key}`, serialized, 'EX', ttlSeconds);
    } else {
      await this.redis.set(`${this.PREFIX}${key}`, serialized);
    }
  }

  /**
   * Set key chỉ khi chưa tồn tại (atomic NX).
   * Trả về true nếu set thành công (key mới), false nếu key đã tồn tại.
   */
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(`${this.PREFIX}${key}`, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.redis.del(`${this.PREFIX}${key}`);
  }
}
