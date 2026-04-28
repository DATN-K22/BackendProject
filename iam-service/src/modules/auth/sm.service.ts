import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { ISecretManagementService } from './secret-management.interface'

interface CachedSecret {
  value: string
  loadedAt: number
}

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 ngày

@Injectable()
export class AwsSecretService implements OnModuleInit, ISecretManagementService {
  private readonly logger = new Logger(AwsSecretService.name)
  private readonly client: SecretsManagerClient
  private cache = new Map<string, CachedSecret>()

  constructor(private readonly configService: ConfigService) {
    this.client = new SecretsManagerClient({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_KEY')
      }
    })
  }

  async onModuleInit() {
    const secretName = this.configService.getOrThrow<string>('JWT_SECRET_NAME')
    await this.getSecret(secretName)
    this.logger.log(`Warmed up secret: ${secretName}`)
  }

  async getSecret(secretName: string): Promise<string> {
    const cached = this.cache.get(secretName)
    const now = Date.now()

    if (cached && now - cached.loadedAt < CACHE_TTL_MS) {
      return cached.value
    }

    this.logger.log(`Fetching secret from AWS: ${secretName}`)
    const command = new GetSecretValueCommand({ SecretId: secretName })
    const response = await this.client.send(command)

    const raw = response.SecretString
    if (!raw) {
      throw new Error(`Secret "${secretName}" is empty or binary — not supported`)
    }

    let value: string
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      value = parsed['jwt_secret'] ?? raw
    } catch {
      value = raw
    }

    this.cache.set(secretName, { value, loadedAt: now })
    return value
  }

  invalidate(secretName: string) {
    this.cache.delete(secretName)
    this.logger.warn(`Cache invalidated for secret: ${secretName}`)
  }
}
