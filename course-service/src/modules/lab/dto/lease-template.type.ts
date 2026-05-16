// types/lease-template.type.ts
interface BudgetThreshold {
  dollarsSpent: number
  action: 'ALERT' | 'TERMINATE'
}

interface DurationThreshold {
  hoursRemaining: number
  action: 'ALERT' | 'TERMINATE'
}

interface LeaseTemplateMeta {
  createdTime: string
  lastEditTime: string
  schemaVersion: number
}

interface LeaseTemplate {
  uuid: string
  name: string
  requiresApproval: boolean
  createdBy: string
  description: string
  visibility: 'PUBLIC' | 'PRIVATE'
  maxSpend: number
  budgetThresholds: BudgetThreshold[]
  leaseDurationInHours: number
  durationThresholds: DurationThreshold[]
  costReportGroup: string
  blueprintId: string
  blueprintName: string
  meta: LeaseTemplateMeta
}

interface LeaseTemplateResponse {
  data: {
    result: LeaseTemplate[]
    nextPageIdentifier: string
  }
  status: string
}

interface LeaseTemplateSummary {
  uuid: string
  name: string
  description: string
}
