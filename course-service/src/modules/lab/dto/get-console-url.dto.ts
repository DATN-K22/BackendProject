export class Lease {
  uuid!: string
  leaseId!: string
  awsAccountId!: string
  leaseDurationInHours?: number
  expirationDate!: string
  blueprintId?: string
  originalLeaseTemplateUuid?: string
}

export class ConsoleUrlResponse {
  consoleUrl!: string
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
    sessionToken: string
    expiration: string
  }
}

export class GetConsoleUrlRequest {
  leaseId!: string
  uuid!: string
  awsAccountId!: string
  leaseDurationInHours?: number
  expirationDate!: string
  blueprintId?: string
  originalLeaseTemplateUuid?: string
}
