import { Inject, Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts'

import { LabRepository } from './lab.repository'
import { ISecretManagementService } from './secret-management.interface'
import { IsbClient } from '../innovation-sandbox/IsbClient'
import { ConsoleUrlResponse, Lease } from './dto/get-console-url.dto'
import { IAMClient, ListRolesCommand, ListRolesCommandOutput, PutRolePolicyCommand, Role } from '@aws-sdk/client-iam'
import { response } from 'express'

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
        displayName: '',
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

  async startLab(leaseData: { chapterItemId: string; leaseTemplateUuid: string; userId: string }) {
    const token = await this.generateLabToken()
    const lab = await this.labRepository.getLabByChapterItemId(leaseData.chapterItemId)
    if (!lab) {
      throw new BadRequestException(`No lab found for chapter item ID: ${leaseData.chapterItemId}`)
    }
    const labSession = await this.labRepository.createLabSession(leaseData.userId, '', lab.id)

    try {
      const response = await this.isbClient.startSession(
        leaseData.leaseTemplateUuid,
        leaseData.userId,
        this.labUserEmail,
        token.access_token
      )

      const leaseId =
        this.base64EncodeCompositeKey({
          uuid: response.data.uuid,
          userEmail: this.labUserEmail
        }) || ''

      await this.labRepository.updateLabSessionLeaseId(labSession.id, leaseId)

      return {
        ...response.data,
        leaseId
      }
    } catch (error) {
      await this.labRepository
        .deleteLabSession(labSession.id)
        .catch((err) => this.logger.error(`Failed to rollback lab session ${labSession.id}`, err))

      this.logger.error(`Failed to start lab session`, error)
      throw new InternalServerErrorException('Failed to start lab session')
    }
  }

  async getLabHistory(userId: string, leaseTemplateId: string, pageSize: number) {
    const labSessions = await this.labRepository.getLabSessionByUserIdAndLeaseTemplateId(
      userId,
      leaseTemplateId,
      +pageSize
    )
    const token = await this.generateLabToken()

    try {
      const response = await this.isbClient.findLeasesByUserEmail(this.labUserEmail, token.access_token)

      const leases = response.data?.result ?? []
      this.logger.debug(`Fetched ${leases.length} leases from ISB ${JSON.stringify(leases)}`)
      const sessionLeaseIds = new Set(labSessions.map((session) => session.lease_id))

      const filteredLeases = leases
        .filter((lease: any) => {
          return sessionLeaseIds.has(lease.leaseId) && lease.comments === userId
        })
        .sort((a: any, b: any) => new Date(b.meta?.createdTime).getTime() - new Date(a.meta?.createdTime).getTime())
        .slice(0, pageSize)

      this.logger.debug(
        `Filtered down to ${filteredLeases.length} leases after matching with DB sessions ${JSON.stringify(filteredLeases)}`
      )
      return {
        result: filteredLeases,
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

  async terminateLab(leaseId: string, body: { userId: string; labId: string }) {
    const { userId, labId } = body

    // 1. Lấy LabSession kèm Lab để có IAMRoleName
    const labSession = await this.labRepository.getLabSessionWithLab(userId, BigInt(labId), leaseId)
    if (!labSession) {
      throw new BadRequestException(`Lab session not found for labId: ${labId}, userId: ${userId}`)
    }

    const iamRoleName = labSession.lab.IAMRoleName
    if (!iamRoleName) {
      throw new BadRequestException(`Lab ${labId} has no IAMRoleName configured`)
    }

    const token = await this.generateLabToken()

    const lease = await this.getLeaseById(leaseId)
    if (!lease?.awsAccountId) {
      throw new BadRequestException('Cannot resolve awsAccountId from lease')
    }

    // 3. Terminate lease trên ISB
    try {
      await this.isbClient.terminateLease(leaseId, token.access_token)
      this.logger.log(`Lease ${leaseId} terminated on ISB`)
    } catch (error) {
      this.logger.error(`Failed to terminate lease on ISB: ${leaseId}`, error)
      throw new InternalServerErrorException('Failed to terminate lease on ISB')
    }

    // 4. Revoke active AWS session
    await this.revokeActiveSession(lease.awsAccountId, iamRoleName)

    return { leaseId: labSession.lease_id }
  }

  private async revokeActiveSession(awsAccountId: string, roleName: string): Promise<void> {
    // Assume role trung gian từ env (runner role có quyền attach policy)
    const runnerRoleArn = this.configService.getOrThrow<string>('LAB_RUNNER_ROLE_ARN')

    let runnerCredentials: Credentials
    try {
      const res = await this.stsClient.send(
        new AssumeRoleCommand({
          RoleArn: runnerRoleArn,
          RoleSessionName: `terminate-runner-${Date.now()}`,
          DurationSeconds: 900 // 15 phút là đủ
        })
      )

      if (!res.Credentials) {
        throw new InternalServerErrorException('Failed to assume runner role')
      }
      runnerCredentials = res.Credentials
    } catch (error) {
      this.logger.error(`Failed to assume runner role: ${runnerRoleArn}`, error)
      throw new InternalServerErrorException('Failed to assume runner role for termination')
    }

    // Dùng runner credentials để assume role của lab account
    const labRoleArn = this.buildRoleArn(awsAccountId, roleName)
    let labCredentials: Credentials
    try {
      const labStsClient = new STSClient({
        region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: runnerCredentials.AccessKeyId!,
          secretAccessKey: runnerCredentials.SecretAccessKey!,
          sessionToken: runnerCredentials.SessionToken!
        }
      })

      const res = await labStsClient.send(
        new AssumeRoleCommand({
          RoleArn: labRoleArn,
          RoleSessionName: `terminate-lab-${Date.now()}`,
          DurationSeconds: 900
        })
      )

      if (!res.Credentials) {
        throw new InternalServerErrorException('Failed to assume lab role')
      }
      labCredentials = res.Credentials
    } catch (error) {
      this.logger.error(`Failed to assume lab role: ${labRoleArn}`, error)
      throw new InternalServerErrorException('Failed to assume lab role for termination')
    }

    // Attach inline deny policy để revoke tất cả session được issue trước thời điểm hiện tại
    const revokeTime = new Date().toISOString()
    const denyPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'RevokeOldSessions',
          Effect: 'Deny',
          Action: '*',
          Resource: '*',
          Condition: {
            DateLessThan: {
              'aws:TokenIssueTime': revokeTime
            }
          }
        }
      ]
    }

    try {
      const iamClient = new IAMClient({
        region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
        credentials: {
          accessKeyId: labCredentials.AccessKeyId!,
          secretAccessKey: labCredentials.SecretAccessKey!,
          sessionToken: labCredentials.SessionToken!
        }
      })

      await iamClient.send(
        new PutRolePolicyCommand({
          RoleName: roleName,
          PolicyName: 'RevokeActiveSessionsPolicy',
          PolicyDocument: JSON.stringify(denyPolicy)
        })
      )

      this.logger.log(`Successfully revoked sessions for role ${roleName} before ${revokeTime}`)
    } catch (error) {
      this.logger.error(`Failed to attach revoke policy to role ${roleName}`, error)
      throw new InternalServerErrorException('Failed to revoke active sessions')
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

  async getLeaseTemplates(keyword: string): Promise<LeaseTemplateSummary[]> {
    const token = await this.generateLabToken()

    try {
      const response: LeaseTemplateResponse = await this.isbClient.findLeaseTemplates(token.access_token)
      const templates: LeaseTemplate[] = response.data.result

      return templates
        .filter((template) => template.name.toLowerCase().includes(keyword.toLowerCase()))
        .map(({ uuid, name, description }) => ({ uuid, name, description }))
    } catch (error) {
      this.logger.error(`Failed to fetch lease templates: ${error}`)
      throw new InternalServerErrorException('Failed to fetch lease templates')
    }
  }

  async getIamRoles(keyword: string): Promise<{ roleName: string; roleArn: string }[]> {
    const iamClient = new IAMClient({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1')
    })

    try {
      const allRoles: { roleName: string; roleArn: string }[] = []
      let marker: string | undefined = undefined

      do {
        const command = new ListRolesCommand({
          PathPrefix: '/',
          Marker: marker,
          MaxItems: 100
        })

        const response: ListRolesCommandOutput = await iamClient.send(command)

        this.logger.debug(
          `Page fetched: ${response.Roles?.length ?? 0} roles, IsTruncated: ${response.IsTruncated}, NextMarker: ${response.Marker}`
        )

        const roles = (response.Roles ?? [])
          .filter((role: Role) => role.RoleName?.startsWith('keep-'))
          .filter((role: Role) => !keyword || role.RoleName?.toLowerCase().includes(keyword.toLowerCase()))
          .map((role: Role) => ({
            roleName: role.RoleName ?? '',
            roleArn: role.Arn ?? ''
          }))

        allRoles.push(...roles)

        marker = response.IsTruncated ? response.Marker : undefined
      } while (marker)

      this.logger.debug(`Total roles fetched across all pages: ${allRoles.length}`)

      return allRoles
    } catch (error) {
      this.logger.error(`Failed to fetch IAM roles: ${error}`)
      throw new InternalServerErrorException('Failed to fetch IAM roles')
    }
  }
}
