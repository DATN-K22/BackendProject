export interface IsbClient {
  findLeasesByUserEmail(userEmail: string, token: string): Promise<any>
  findLeaseById(leaseId: string, token: string): Promise<any>
  startSession(leaseTemplateId: string, userId: string, userEmail: string, token: string): Promise<any>
  terminateLease(leaseId: string, token: string): Promise<any>
  findLeaseTemplates(token: string): Promise<LeaseTemplateResponse>
}
