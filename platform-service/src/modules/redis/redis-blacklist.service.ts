import { Inject, Injectable } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisBlacklistService {
  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async blacklistToken(jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000)
    if (ttl <= 0) return
    await this.redis.set(`iam:blacklist:${jti}`, '1', 'EX', ttl)
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    return (await this.redis.get(`iam:blacklist:${jti}`)) !== null
  }
}
