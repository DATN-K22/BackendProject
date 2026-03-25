import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { RedisBlacklistService } from './redis-blacklist.service'
import { RedisCacheService } from './redis-cache.service'

export const REDIS_CLIENT = 'REDIS_CLIENT'

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
          password: config.get('REDIS_PASSWORD'),
          retryStrategy: (times) => Math.min(times * 50, 2000)
        }),
      inject: [ConfigService]
    },
    RedisBlacklistService,
    RedisCacheService
  ],
  exports: [REDIS_CLIENT, RedisBlacklistService, RedisCacheService]
})
export class RedisModule {}
