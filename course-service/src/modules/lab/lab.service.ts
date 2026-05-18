import { Inject, Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts'

import { LabRepository } from './lab.repository'
import { ISecretManagementService } from './secret-management.interface'
import { IsbClient } from '../innovation-sandbox/IsbClient'
import { ConsoleUrlResponse, Lease } from './dto/get-console-url.dto'
import { IAMClient, ListRolesCommand, ListRolesCommandOutput, PutRolePolicyCommand, Role } from '@aws-sdk/client-iam'

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
    this.labUserEmail = this.configService.getOrThrow<string>('LAB_USER_EMAIL')
    this.initializeAwsClients()
  }

  private getExplicitCredentials() {
    const accessKeyId = this.configService.getOrThrow<string>('AWS_ACKID')
    const secretAccessKey = this.configService.getOrThrow<string>('AWS_SACK')
    const sessionToken = this.configService.get<string>('AWS_SESSION_TOKEN') // optional

    return sessionToken ? { accessKeyId, secretAccessKey, sessionToken } : { accessKeyId, secretAccessKey }
  }

  /**
   * Initialize STS client using explicit IAM credentials
   */
  private initializeAwsClients(): void {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
    try {
      this.stsClient = new STSClient({
        region,
        credentials: this.getExplicitCredentials()
      })
      this.logger.debug(`AWS clients initialized with explicit IAM credentials for region: ${region}`)
    } catch (error) {
      this.logger.error(`Failed to initialize AWS clients: ${error}`)
      throw error
    }
  }

  /**
   * Create a new STSClient using explicit IAM credentials (for cross-account flows)
   */
  private createStsClient(credentials?: Credentials): STSClient {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')

    if (credentials) {
      return new STSClient({
        region,
        credentials: {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken
        }
      })
    }

    return new STSClient({
      region,
      credentials: this.getExplicitCredentials()
    })
  }

  /**
   * Create a new IAMClient using explicit credentials (assumed or base)
   */
  private createIamClient(credentials: Credentials): IAMClient {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
    return new IAMClient({
      region,
      credentials: {
        accessKeyId: credentials.AccessKeyId!,
        secretAccessKey: credentials.SecretAccessKey!,
        sessionToken: credentials.SessionToken
      }
    })
  }

  // ─────────────────────────────────────────────
  // Business logic below — unchanged in intent
  // ─────────────────────────────────────────────

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

    return { access_token: token }
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
          userEmail: this.labUserEmail,
          uuid: response.data.uuid
        }) || ''

      this.logger.debug(`Started lab session ${labSession.id} with lease ID: ${leaseId}`)
      await this.labRepository.updateLabSessionLeaseId(labSession.id, leaseId)

      return { ...response.data, leaseId }
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

      const sessionLeaseIds = new Set(labSessions.map((session) => session.lease_id))

      const filteredLeases = leases
        .filter((lease: any) => sessionLeaseIds.has(lease.leaseId) && lease.comments === userId)
        .sort((a: any, b: any) => new Date(b.meta?.createdTime).getTime() - new Date(a.meta?.createdTime).getTime())
        .slice(0, pageSize)

      return { result: filteredLeases, nextPageIdentifier: null }
    } catch (error) {
      this.logger.error('Failed to fetch lab history', error)
      return { result: [], nextPageIdentifier: null }
    }
  }

  async terminateLab(leaseId: string, body: { userId: string; chapterItemId: string }) {
    const { userId, chapterItemId } = body

    const lab = await this.labRepository.getLabByChapterItemId(chapterItemId)
    if (!lab) throw new BadRequestException(`Lab not found for chapter item ID: ${chapterItemId}`)

    const labSession = await this.labRepository.getLabSessionWithLab(userId, BigInt(lab.id), leaseId)
    if (!labSession) throw new BadRequestException(`Lab session not found for labId: ${lab.id}, userId: ${userId}`)

    const iamRoleName = labSession.lab.IAMRoleName
    if (!iamRoleName) throw new BadRequestException(`Lab ${lab.id} has no IAMRoleName configured`)

    const token = await this.generateLabToken()

    const lease = await this.getLeaseById(leaseId)
    if (!lease?.awsAccountId) throw new BadRequestException('Cannot resolve awsAccountId from lease')

    await this.revokeActiveSession(lease.awsAccountId, iamRoleName)

    try {
      await this.isbClient.terminateLease(leaseId, token.access_token)
      this.logger.log(`Lease ${leaseId} terminated on ISB`)
    } catch (error) {
      this.logger.error(`Failed to terminate lease on ISB: ${leaseId}`, error)
      throw new InternalServerErrorException('Failed to terminate lease on ISB')
    }

    return { leaseId: labSession.lease_id }
  }

  private async revokeActiveSession(awsAccountId: string, roleName: string): Promise<void> {
    const revokeTime = new Date().toISOString()
    const denyPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'RevokeOldSessions',
          Effect: 'Deny',
          Action: '*',
          Resource: '*',
          Condition: { DateLessThan: { 'aws:TokenIssueTime': revokeTime } }
        }
      ]
    }

    try {
      const iamClient = new IAMClient({
        region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
        credentials: this.getExplicitCredentials()
      })

      await iamClient.send(
        new PutRolePolicyCommand({
          RoleName: roleName,
          PolicyName: 'RevokeActiveSessionsPolicy',
          PolicyDocument: JSON.stringify(denyPolicy)
        })
      )

      this.logger.log(`Revoked sessions for role ${roleName} in account ${awsAccountId} before ${revokeTime}`)
    } catch (error) {
      this.logger.error(`Failed to attach revoke policy to role ${roleName} in account ${awsAccountId}`, error)
      throw new InternalServerErrorException('Failed to revoke active sessions')
    }
  }

  async getConsoleUrl(lease: Lease): Promise<ConsoleUrlResponse> {
    try {
      this.validateLease(lease)
      const iamConfig = await this.resolveIamConfig(lease)
      const credentials = await this.assumeRole(iamConfig, lease)
      const sessionDurationSeconds = this.calculateSessionDuration(lease)
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

  private validateLease(lease: Lease): void {
    if (!lease.uuid || !lease.awsAccountId) throw new BadRequestException('Invalid lease: missing uuid or awsAccountId')
    if (!lease.expirationDate) throw new BadRequestException('Lease has no expiration date')

    const remainingSeconds = Math.floor((new Date(lease.expirationDate).getTime() - Date.now()) / 1000)
    if (remainingSeconds <= 0) throw new BadRequestException('Lease has already expired')
  }

  private async resolveIamConfig(lease: Lease): Promise<{ roleArn: string; sessionPolicy?: string }> {
    return {
      roleArn: await this.resolveRoleArn(lease),
      sessionPolicy: await this.resolveSessionPolicy(lease)
    }
  }

  private async resolveRoleArn(lease: Lease): Promise<string> {
    const lab = await this.labRepository.getLabByLeaseId(lease.leaseId)
    if (!lab) throw new InternalServerErrorException("Can't get lab for lease, cannot resolve IAM role")

    const roleArn =
      this.buildRoleArn(lease.awsAccountId, lab.IAMRoleName || '') ||
      this.configService.get<string>('DEFAULT_LAB_ROLE_ARN')

    if (!roleArn) throw new InternalServerErrorException('No IAM Role available for assume')

    this.logger.debug(`Resolved role ARN: ${roleArn.replace(/arn:aws:iam::\d+:/, 'arn:aws:iam::***:')}`)
    return roleArn
  }

  private async resolveSessionPolicy(lease: Lease): Promise<string | undefined> {
    if (!lease.originalLeaseTemplateUuid) return undefined

    try {
      const policyId = this.configService.get<string>(
        `LEASE_TEMPLATE_${lease.originalLeaseTemplateUuid}_SESSION_POLICY_ID`
      )
      if (!policyId) return undefined

      const policy = this.configService.get<string>(`SESSION_POLICY_${policyId}`)
      return this.normalizeSessionPolicy(policy)
    } catch (error) {
      if (error instanceof BadRequestException) throw error
      this.logger.warn(`Failed to resolve session policy: ${error}`)
      return undefined
    }
  }

  private buildRoleArn(accountId: string, roleName: string): string {
    if (!accountId || !roleName) throw new BadRequestException('Invalid accountId or roleName')
    return `arn:aws:iam::${accountId}:role/${roleName}`
  }

  private normalizeSessionPolicy(policy?: string): string | undefined {
    if (!policy) return undefined
    try {
      return JSON.stringify(JSON.parse(policy))
    } catch {
      throw new BadRequestException('Invalid session policy JSON format')
    }
  }

  private calculateSessionDuration(lease: Lease): number {
    const maxDurationHours = this.configService.get<number>('LEASE_MAX_DURATION_HOURS', 12)
    return Math.min((lease.leaseDurationInHours || 1) * 3600, maxDurationHours * 3600)
  }

  private async assumeRole(iamConfig: { roleArn: string; sessionPolicy?: string }, lease: Lease): Promise<Credentials> {
    const remainingSeconds = Math.floor((new Date(lease.expirationDate).getTime() - Date.now()) / 1000)
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

    try {
      const res = await this.stsClient.send(new AssumeRoleCommand(input))
      if (!res.Credentials) throw new InternalServerErrorException('AssumeRole failed: no credentials returned')
      return res.Credentials
    } catch (error) {
      this.logger.error(`Failed to assume role: ${error}`)
      throw error
    }
  }

  private async generateConsoleUrl(creds: Credentials, sessionDurationSeconds: number): Promise<string> {
    const sessionJson = JSON.stringify({
      sessionId: creds.AccessKeyId,
      sessionKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken
    })

    const tokenRes = await fetch(
      `https://signin.aws.amazon.com/federation?${new URLSearchParams({
        Action: 'getSigninToken',
        Session: sessionJson,
        SessionDuration: sessionDurationSeconds.toString()
      })}`,
      { method: 'GET' }
    )

    const responseText = await tokenRes.text()
    if (!tokenRes.ok) throw new InternalServerErrorException(`Failed to retrieve SigninToken: HTTP ${tokenRes.status}`)

    let data: { SigninToken?: string }
    try {
      data = JSON.parse(responseText)
    } catch {
      throw new InternalServerErrorException('Invalid JSON response from federation service')
    }

    if (!data?.SigninToken) throw new InternalServerErrorException('SigninToken missing in federation response')

    return `https://signin.aws.amazon.com/federation?${new URLSearchParams({
      Action: 'login',
      Destination: 'https://console.aws.amazon.com/',
      SigninToken: data.SigninToken
    })}`
  }

  private base64EncodeCompositeKey(key: Record<string, any> | undefined): string | null {
    if (key === undefined) return null
    return Buffer.from(JSON.stringify(key), 'utf8').toString('base64')
  }

  async getLeaseTemplates(keyword: string): Promise<LeaseTemplateSummary[]> {
    const token = await this.generateLabToken()
    try {
      const response: LeaseTemplateResponse = await this.isbClient.findLeaseTemplates(token.access_token)
      return response.data.result
        .filter((t: LeaseTemplate) => t.name.toLowerCase().includes(keyword.toLowerCase()))
        .map(({ uuid, name, description }) => ({ uuid, name, description }))
    } catch (error) {
      this.logger.error(`Failed to fetch lease templates: ${error}`)
      throw new InternalServerErrorException('Failed to fetch lease templates')
    }
  }

  async getIamRoles(keyword: string): Promise<{ roleName: string; roleArn: string }[]> {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
    const runnerRoleArn = this.configService.getOrThrow<string>('CROSS_ACCOUNT_IAM_READER_ROLE_ARN')

    // Use explicit credentials instead of ECS task role
    const baseStsClient = this.createStsClient()

    let assumedCredentials: Credentials
    try {
      const res = await baseStsClient.send(
        new AssumeRoleCommand({
          RoleArn: runnerRoleArn,
          RoleSessionName: 'iam-reader-session'
        })
      )
      if (!res.Credentials) throw new Error('Failed to assume cross-account IAM reader role')
      assumedCredentials = res.Credentials
    } catch (error) {
      this.logger.error(`Failed to assume IAM reader role: ${error}`)
      throw new InternalServerErrorException('Failed to assume IAM reader role')
    }

    const iamClient = this.createIamClient(assumedCredentials)
    const allRoles: { roleName: string; roleArn: string }[] = []
    let marker: string | undefined

    do {
      const response: ListRolesCommandOutput = await iamClient.send(
        new ListRolesCommand({ PathPrefix: '/', Marker: marker, MaxItems: 100 })
      )

      const roles = (response.Roles ?? [])
        .filter((role: Role) => role.RoleName?.startsWith('keep-'))
        .filter((role: Role) => !keyword || role.RoleName?.toLowerCase().includes(keyword.toLowerCase()))
        .map((role: Role) => ({ roleName: role.RoleName ?? '', roleArn: role.Arn ?? '' }))

      allRoles.push(...roles)
      marker = response.IsTruncated ? response.Marker : undefined
    } while (marker)

    return allRoles
  }
}
