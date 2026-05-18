import { Inject, Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts'
import { IAMClient, ListRolesCommand, ListRolesCommandOutput, Role } from '@aws-sdk/client-iam'
import { LambdaClient, InvokeCommand, InvokeCommandInput } from '@aws-sdk/client-lambda'

import { LabRepository } from './lab.repository'
import { ISecretManagementService } from './secret-management.interface'
import { IsbClient } from '../innovation-sandbox/IsbClient'
import { ConsoleUrlResponse, Lease } from './dto/get-console-url.dto'

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name)
  private stsClient!: STSClient
  private lambdaClient!: LambdaClient
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

  private initializeAwsClients(): void {
    const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
    try {
      this.stsClient = new STSClient({ region })
      this.lambdaClient = new LambdaClient({ region })
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
      const sessionLeaseIds = new Set(labSessions.map((session) => session.lease_id))

      const filteredLeases = leases
        .filter((lease: any) => {
          return sessionLeaseIds.has(lease.leaseId) && lease.comments === userId
        })
        .sort((a: any, b: any) => new Date(b.meta?.createdTime).getTime() - new Date(a.meta?.createdTime).getTime())
        .slice(0, pageSize)

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

  async terminateLab(leaseId: string, body: { userId: string; chapterItemId: string }) {
    const { userId, chapterItemId } = body

    const labSession = await this.labRepository.getLabSessionWithLab(userId, leaseId, chapterItemId)
    if (!labSession) {
      throw new BadRequestException(`Lab session not found for chapterItemId: ${chapterItemId}, userId: ${userId}`)
    }

    const iamRoleName = labSession.lab.IAMRoleName
    if (!iamRoleName) {
      throw new BadRequestException(`Lab ${labSession.lab.id} has no IAMRoleName configured`)
    }

    const [token, lease] = await Promise.all([this.generateLabToken(), this.getLeaseById(leaseId)])

    if (!lease?.awsAccountId) {
      throw new BadRequestException('Cannot resolve awsAccountId from lease')
    }

    await this.invokeLambda(this.configService.getOrThrow<string>('LAMBDA_REVOKE_SESSION_FUNCTION_NAME'), {
      awsAccountId: lease.awsAccountId,
      roleName: iamRoleName
    })
    this.logger.log(`Revoked sessions for role ${iamRoleName} in account ${lease.awsAccountId}`)

    await this.isbClient.terminateLease(leaseId, token.access_token)
    this.logger.log(`Lease ${leaseId} terminated on ISB`)

    return { leaseId: labSession.lease_id }
  }

  async getConsoleUrl(lease: Lease): Promise<ConsoleUrlResponse> {
    try {
      this.validateLease(lease)

      const iamConfig = await this.resolveIamConfig(lease)
      const sessionDurationSeconds = this.calculateSessionDuration(lease)

      const result = await this.invokeLambda(
        this.configService.getOrThrow<string>('LAMBDA_CONSOLE_URL_FUNCTION_NAME'),
        {
          roleArn: iamConfig.roleArn,
          durationSeconds: sessionDurationSeconds,
          sessionName: `lease-${lease.uuid}`,
          leaseId: lease.uuid,
          sessionPolicy: iamConfig.sessionPolicy
        }
      )

      return {
        consoleUrl: result.consoleUrl ?? '',
        credentials: result.credentials
      }
    } catch (error) {
      this.logger.error(`Failed to generate console URL for lease ${lease.uuid}`, error)
      throw new InternalServerErrorException(error instanceof Error ? error.message : 'Failed to generate console URL')
    }
  }

  async getConsoleUrlWithEcsTask(
    lease: Lease,
    ecsConfig?: {
      taskDefinition: string
      cluster: string
      containerName: string
      launchType?: string
      subnets?: string[]
      securityGroups?: string[]
      taskPayload?: Record<string, any>
    }
  ): Promise<
    ConsoleUrlResponse & {
      ecsTask?: {
        taskArn: string
        lastStatus: string
      }
    }
  > {
    try {
      this.validateLease(lease)

      const iamConfig = await this.resolveIamConfig(lease)
      const sessionDurationSeconds = this.calculateSessionDuration(lease)

      const result = await this.invokeLambda(
        this.configService.getOrThrow<string>('LAMBDA_CONSOLE_URL_FUNCTION_NAME'),
        {
          roleArn: iamConfig.roleArn,
          durationSeconds: sessionDurationSeconds,
          sessionName: `lease-${lease.uuid}`,
          leaseId: lease.uuid,
          sessionPolicy: iamConfig.sessionPolicy,
          ...(ecsConfig && {
            ecsTaskDefinition: ecsConfig.taskDefinition,
            ecsCluster: ecsConfig.cluster,
            ecsContainerName: ecsConfig.containerName,
            ecsLaunchType: ecsConfig.launchType || 'FARGATE',
            ecsSubnets: ecsConfig.subnets || [],
            ecsSecurityGroups: ecsConfig.securityGroups || [],
            taskPayload: ecsConfig.taskPayload
          })
        }
      )

      return {
        consoleUrl: result.consoleUrl ?? '',
        credentials: result.credentials,
        ecsTask: result.ecsTask
      }
    } catch (error) {
      this.logger.error(`Failed to generate console URL with ECS task for lease ${lease.uuid}`, error)
      throw new InternalServerErrorException(error instanceof Error ? error.message : 'Failed to generate console URL')
    }
  }

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

  private async resolveIamConfig(lease: Lease): Promise<{
    roleArn: string
    sessionPolicy?: string
  }> {
    const roleArn = await this.resolveRoleArn(lease)
    const sessionPolicy = await this.resolveSessionPolicy(lease)

    return { roleArn, sessionPolicy }
  }

  private async resolveRoleArn(lease: Lease): Promise<string> {
    const lab = await this.labRepository.getLabByLeaseId(lease.leaseId)
    if (!lab) {
      throw new InternalServerErrorException("Can't get lab for lease, cannot resolve IAM role")
    }

    let roleArn = this.buildRoleArn(lease.awsAccountId, lab.IAMRoleName || '')

    if (!roleArn) {
      roleArn = this.configService.get<string>('DEFAULT_LAB_ROLE_ARN') ?? ''
    }

    if (!roleArn) {
      throw new InternalServerErrorException('No IAM Role available for assume')
    }

    this.logger.debug(`Resolved role ARN: ${roleArn.replace(/arn:aws:iam::\d+:/, 'arn:aws:iam::***:')}`)

    return roleArn
  }

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
      if (error instanceof BadRequestException) {
        throw error
      }

      this.logger.warn(`Failed to resolve session policy: ${error}`)
      return undefined
    }
  }

  private buildRoleArn(accountId: string, roleName: string): string {
    if (!accountId || !roleName) {
      throw new BadRequestException('Invalid accountId or roleName')
    }

    return `arn:aws:iam::${accountId}:role/${roleName}`
  }

  private normalizeSessionPolicy(policy?: string): string | undefined {
    if (!policy) return undefined

    try {
      const parsed = JSON.parse(policy)
      return JSON.stringify(parsed)
    } catch {
      throw new BadRequestException('Invalid session policy JSON format')
    }
  }

  private calculateSessionDuration(lease: Lease): number {
    const maxDurationHours = this.configService.get<number>('LEASE_MAX_DURATION_HOURS', 12)

    const leaseDurationSeconds = (lease.leaseDurationInHours || 1) * 3600
    const maxDurationSeconds = maxDurationHours * 3600

    return Math.min(leaseDurationSeconds, maxDurationSeconds)
  }

  private async invokeLambda(
    functionName: string,
    payload: Record<string, any>
  ): Promise<{
    consoleUrl?: string
    credentials?: any
    ecsTask?: any
    message?: string
  }> {
    try {
      this.logger.debug(`Invoking Lambda function: ${functionName}`)

      const input: InvokeCommandInput = {
        FunctionName: functionName,
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify(payload)
      }

      const response = await this.lambdaClient.send(new InvokeCommand(input))

      let statusCode = 200
      let body = ''

      if (response.Payload) {
        const payloadString =
          response.Payload instanceof Uint8Array
            ? new TextDecoder().decode(response.Payload)
            : typeof response.Payload === 'string'
              ? response.Payload
              : JSON.stringify(response.Payload)

        try {
          const parsed = JSON.parse(payloadString)
          statusCode = parsed.statusCode || 200
          body = typeof parsed.body === 'string' ? parsed.body : JSON.stringify(parsed.body)
        } catch {
          body = payloadString
        }
      }

      if (response.FunctionError) {
        this.logger.error(`Lambda execution error in ${functionName}: ${body}`)
        throw new InternalServerErrorException(`Lambda execution failed: ${body}`)
      }

      if (statusCode !== 200) {
        throw new InternalServerErrorException(`Lambda returned error: ${body}`)
      }

      const parsedBody = JSON.parse(body)

      this.logger.debug(`Lambda execution successful for ${functionName}`)

      return parsedBody
    } catch (error) {
      this.logger.error(`Failed to invoke Lambda ${functionName}: ${error}`)
      throw error
    }
  }

  async getLeaseTemplates(keyword: string): Promise<any[]> {
    const token = await this.generateLabToken()

    try {
      const response: any = await this.isbClient.findLeaseTemplates(token.access_token)
      const templates: any[] = response.data.result

      return templates
        .filter((template) => template.name.toLowerCase().includes(keyword.toLowerCase()))
        .map(({ uuid, name, description }) => ({ uuid, name, description }))
    } catch (error) {
      this.logger.error(`Failed to fetch lease templates: ${error}`)
      throw new InternalServerErrorException('Failed to fetch lease templates')
    }
  }

  async getIamRoles(keyword: string): Promise<{ roleName: string; roleArn: string }[]> {
    try {
      const region = this.configService.get<string>('AWS_REGION', 'us-east-1')
      const runnerRoleArn = this.configService.getOrThrow<string>('CROSS_ACCOUNT_IAM_READER_ROLE_ARN')
      const stsClient = new STSClient({ region })

      const assumedRole = await stsClient.send(
        new AssumeRoleCommand({
          RoleArn: runnerRoleArn,
          RoleSessionName: 'ecs-cross-account-session'
        })
      )

      if (!assumedRole.Credentials) {
        throw new Error('Failed to assume role')
      }

      const { AccessKeyId, SecretAccessKey, SessionToken } = assumedRole.Credentials

      if (!AccessKeyId || !SecretAccessKey) {
        throw new Error('Assumed role credentials are incomplete')
      }

      const iamClient = new IAMClient({
        region,
        credentials: {
          accessKeyId: AccessKeyId,
          secretAccessKey: SecretAccessKey,
          sessionToken: SessionToken
        }
      })

      const allRoles: { roleName: string; roleArn: string }[] = []
      let marker: string | undefined = undefined

      do {
        const command = new ListRolesCommand({
          PathPrefix: '/',
          Marker: marker,
          MaxItems: 100
        })

        const response: ListRolesCommandOutput = await iamClient.send(command)

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

      return allRoles
    } catch (error) {
      this.logger.error(`Failed to fetch IAM roles: ${error}`)
      throw new InternalServerErrorException('Failed to fetch IAM roles')
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
