import { Inject, Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts'

import { LabRepository } from './lab.repository'
import { ISecretManagementService } from './secret-management.interface'
import { IsbClient } from '../innovation-sandbox/IsbClient'
import { ConsoleUrlResponse, Lease } from './dto/get-console-url.dto'

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name)
  private stsClient!: STSClient
  private readonly labUserEmail: string

  constructor(
    private readonly labRepository: LabRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,

    @Inject('SECRET_MANAGEMENT_SERVICE')
    private readonly awsSecret: ISecretManagementService,

    @Inject('IsbClient')
    private readonly isbClient: IsbClient
  ) {
    // Initialize AWS clients lazily when first needed
    this.labUserEmail = this.configService.getOrThrow<string>('LAB_USER_EMAIL')
    this.initializeAwsClients()
  }

  /**
   * Initialize AWS SDK clients with proper region configuration
   */
  private initializeAwsClients(): void {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
    try {
      this.stsClient = new STSClient({ region })
      this.logger.debug(`AWS clients initialized for region: ${region}`)
    } catch (error) {
      this.logger.error(`Failed to initialize AWS clients: ${error}`)
      throw error
    }
  }

  async generateLabToken() {
    const secretName = this.configService.getOrThrow<string>('JWT_SECRET_NAME')
    const jwtSecret = await this.awsSecret.getSecret(secretName)

    const payload = {
      user: {
        displayName: 'Son Tran',
        userName: this.labUserEmail.split('@')[0],
        email: this.labUserEmail,
        roles: ['Admin']
      }
    }

    const token = await this.jwtService.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: '1h'
    })

    return {
      access_token: token
    }
  }

  async getLeaseById(leaseId: string) {
    const token = await this.generateLabToken()
    try {
      const response = await this.isbClient.findLeaseById(leaseId, token.access_token)
      return response.data
    } catch (error) {
      this.logger.error(`Failed to fetch lease by ID: ${leaseId}`, error)
      throw new InternalServerErrorException('Failed to fetch lease')
    }
  }

  async startLab(leaseData: { leaseTemplateUuid: string; userId: string }) {
    const token = await this.generateLabToken()
    try {
      const response = await this.isbClient.startSession(
        leaseData.leaseTemplateUuid,
        leaseData.userId,
        this.labUserEmail,
        token.access_token
      )
      return {
        ...response.data,
        leaseId: this.base64EncodeCompositeKey({ uuid: response.data.uuid, userEmail: this.labUserEmail })
      }
    } catch (error) {
      this.logger.error(`Failed to start lab session`, error)
      throw new InternalServerErrorException('Failed to start lab session')
    }
  }

  async getLabHistory(userId: string, leaseTemplateId: string, pageSize: number) {
    // 1. Get lab sessions from DB
    const labSessions = await this.labRepository.getLabSessionByUserIdAndLeaseTemplateId(
      userId,
      leaseTemplateId,
      pageSize
    )

    // 2. Generate internal JWT
    const token = await this.generateLabToken()

    try {
      const response = await this.isbClient.findLeasesByUserEmail(this.labUserEmail, token.access_token)

      const leases = response.data?.result ?? []

      const sessionLeaseIds = new Set(labSessions.map((session) => session.lease_id))

      const filteredLeases = leases
        .filter((lease: any) => {
          return sessionLeaseIds.has(lease.leaseId) && lease.comments === userId
        })
        .sort((a: any, b: any) => new Date(b.meta?.createdTime).getTime() - new Date(a.meta?.createdTime).getTime())
        .slice(0, pageSize)

      // 6. Return provider-like response
      return {
        result: filteredLeases,
        // result: leases,
        nextPageIdentifier: null
      }
    } catch (error) {
      this.logger.error('Failed to fetch lab history', error)

      return {
        result: [],
        nextPageIdentifier: null
      }
    }
  }

  /**
   * =========================
   * Get Console URL
   * =========================
   * Generates AWS Console federation URL for a lease
   */
  async getConsoleUrl(lease: Lease): Promise<ConsoleUrlResponse> {
    try {
      // 1. Validate lease
      this.validateLease(lease)

      // 2. Resolve IAM config (lab + fallback chain)
      const iamConfig = await this.resolveIamConfig(lease)

      // 3. Assume role
      const credentials = await this.assumeRole(iamConfig, lease)

      // 4. Calculate session duration
      const sessionDurationSeconds = this.calculateSessionDuration(lease)

      // 5. Generate console URL
      const consoleUrl = await this.generateConsoleUrl(credentials, sessionDurationSeconds)

      return {
        consoleUrl,
        credentials: {
          accessKeyId: credentials.AccessKeyId || '',
          secretAccessKey: credentials.SecretAccessKey || '',
          sessionToken: credentials.SessionToken || '',
          expiration: credentials.Expiration?.toISOString() || new Date().toISOString()
        }
      }
    } catch (error) {
      this.logger.error(`Failed to generate console URL for lease ${lease.uuid}`, error)
      throw new InternalServerErrorException(error instanceof Error ? error.message : 'Failed to generate console URL')
    }
  }

  /**
   * Validates lease data before processing
   */
  private validateLease(lease: Lease): void {
    if (!lease.uuid || !lease.awsAccountId) {
      throw new BadRequestException('Invalid lease: missing uuid or awsAccountId')
    }

    if (!lease.expirationDate) {
      throw new BadRequestException('Lease has no expiration date')
    }

    const now = Date.now()
    const leaseExpiry = new Date(lease.expirationDate).getTime()
    const remainingSeconds = Math.floor((leaseExpiry - now) / 1000)

    if (remainingSeconds <= 0) {
      throw new BadRequestException('Lease has already expired')
    }
  }

  /**
   * =========================
   * Resolve IAM Config
   * =========================
   */
  private async resolveIamConfig(lease: Lease): Promise<{
    roleArn: string
    sessionPolicy?: string
  }> {
    const roleArn = this.resolveRoleArn(lease)
    const sessionPolicy = await this.resolveSessionPolicy(lease)

    return {
      roleArn,
      sessionPolicy
    }
  }

  /**
   * Resolves the IAM role ARN with fallback chain
   * Priority: lease template IAM role > env DEFAULT_LAB_ROLE_ARN
   */
  private resolveRoleArn(lease: Lease): string {
    let roleArn: string | undefined

    // Try to build from lease template if available
    if (lease.originalLeaseTemplateUuid && lease.awsAccountId) {
      // In a real scenario, fetch the template from DB/store
      // For now, we'll use the env variable
      const templateRoleName = this.configService.get<string>(``)

      if (templateRoleName) {
        roleArn = this.buildRoleArn(lease.awsAccountId, templateRoleName)
      }
    }

    // Fallback to default role
    if (!roleArn) {
      roleArn = this.configService.get<string>('DEFAULT_LAB_ROLE_ARN')
    }

    if (!roleArn) {
      throw new InternalServerErrorException('No IAM Role available for assume')
    }

    this.logger.debug(`Resolved role ARN: ${roleArn.replace(/arn:aws:iam::\d+:/, 'arn:aws:iam::***:')}`)

    return roleArn
    roleArn = this.configService.get<string>('DEFAULT_LAB_ROLE_ARN')
    return 'arn:aws:iam::566112927720:role/keep-LabRunnerRole'
  }

  /**
   * Resolves session policy if available
   */
  private async resolveSessionPolicy(lease: Lease): Promise<string | undefined> {
    if (!lease.originalLeaseTemplateUuid) {
      return undefined
    }

    try {
      const policyId = this.configService.get<string>(
        `LEASE_TEMPLATE_${lease.originalLeaseTemplateUuid}_SESSION_POLICY_ID`
      )

      if (!policyId) {
        return undefined
      }

      const policy = this.configService.get<string>(`SESSION_POLICY_${policyId}`)

      if (!policy) {
        return undefined
      }

      return this.normalizeSessionPolicy(policy)
    } catch (error) {
      // Validation errors should propagate
      if (error instanceof BadRequestException) {
        throw error
      }

      // Infra/config errors should degrade gracefully
      this.logger.warn(`Failed to resolve session policy: ${error}`)

      return undefined
    }
  }

  /**
   * =========================
   * Build Role ARN
   * =========================
   */
  private buildRoleArn(accountId: string, roleName: string): string {
    if (!accountId || !roleName) {
      throw new BadRequestException('Invalid accountId or roleName')
    }

    return `arn:aws:iam::${accountId}:role/${roleName}`
  }

  /**
   * =========================
   * Validate & Normalize Session Policy
   * =========================
   */
  private normalizeSessionPolicy(policy?: string): string | undefined {
    if (!policy) return undefined

    try {
      const parsed = JSON.parse(policy)
      return JSON.stringify(parsed)
    } catch {
      throw new BadRequestException('Invalid session policy JSON format')
    }
  }

  /**
   * =========================
   * Calculate Session Duration
   * =========================
   */
  private calculateSessionDuration(lease: Lease): number {
    const maxDurationHours = this.configService.get<number>(
      'LEASE_MAX_DURATION_HOURS',
      12 // AWS default max for assume role is 12 hours
    )

    const leaseDurationSeconds = (lease.leaseDurationInHours || 1) * 3600
    const maxDurationSeconds = maxDurationHours * 3600

    return Math.min(leaseDurationSeconds, maxDurationSeconds)
  }

  /**
   * =========================
   * Assume Role
   * =========================
   */
  private async assumeRole(iamConfig: { roleArn: string; sessionPolicy?: string }, lease: Lease): Promise<Credentials> {
    try {
      const now = Date.now()
      const leaseExpiry = new Date(lease.expirationDate).getTime()
      const remainingSeconds = Math.floor((leaseExpiry - now) / 1000)

      const durationSeconds = Math.min(remainingSeconds, 12 * 3600)

      const input: any = {
        RoleArn: iamConfig.roleArn,
        RoleSessionName: `lease-${lease.uuid}`,
        DurationSeconds: durationSeconds,
        Tags: [{ Key: 'leaseId', Value: lease.uuid }]
      }

      if (iamConfig.sessionPolicy?.trim().length) {
        input.Policy = iamConfig.sessionPolicy
      }

      this.logger.debug(`Assuming role: ${input.RoleSessionName} for ${durationSeconds}s`)

      const res = await this.stsClient.send(new AssumeRoleCommand(input))

      if (!res.Credentials) {
        throw new InternalServerErrorException('AssumeRole failed: no credentials returned')
      }

      this.logger.debug(`Successfully assumed role, expiration: ${res.Credentials.Expiration}`)

      return res.Credentials
    } catch (error) {
      this.logger.error(`Failed to assume role: ${error}`)
      throw error
    }
  }

  /**
   * =========================
   * Generate Federation Console URL
   * =========================
   */
  private async generateConsoleUrl(creds: Credentials, sessionDurationSeconds: number): Promise<string> {
    const sessionJson = JSON.stringify({
      sessionId: creds.AccessKeyId,
      sessionKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken
    })

    const params = new URLSearchParams({
      Action: 'getSigninToken',
      Session: sessionJson,
      SessionDuration: sessionDurationSeconds.toString()
    })

    this.logger.debug('Requesting SigninToken from AWS Federation service')

    try {
      const res = await fetch(`https://signin.aws.amazon.com/federation?${params.toString()}`, {
        method: 'GET'
      })

      const responseText = await res.text()

      if (!res.ok) {
        this.logger.error(`Federation service returned HTTP ${res.status}: ${responseText}`)
        throw new InternalServerErrorException(`Failed to retrieve SigninToken: HTTP ${res.status}`)
      }

      let data: { SigninToken?: string }
      try {
        data = JSON.parse(responseText)
      } catch {
        this.logger.error(`Invalid JSON response from federation: ${responseText}`)
        throw new InternalServerErrorException('Invalid JSON response from federation service')
      }

      if (!data?.SigninToken) {
        this.logger.error(`SigninToken missing in response: ${responseText}`)
        throw new InternalServerErrorException('SigninToken missing in federation response')
      }

      const consoleUrl =
        'https://signin.aws.amazon.com/federation?' +
        new URLSearchParams({
          Action: 'login',
          Destination: 'https://console.aws.amazon.com/',
          SigninToken: data.SigninToken
        }).toString()

      this.logger.debug('Successfully generated console URL')

      return consoleUrl
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error
      }
      this.logger.error(`Unexpected error generating console URL: ${error}`)
      throw new InternalServerErrorException('Failed to generate console URL')
    }
  }

  private base64EncodeCompositeKey(key: Record<string, any> | undefined): string | null {
    if (key === undefined) {
      return null
    }

    const jsonStr = JSON.stringify(key)
    return Buffer.from(jsonStr, 'utf8').toString('base64')
  }
}
