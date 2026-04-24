export interface ISecretManagementService {
  getSecret(secretName: string): Promise<string>
}