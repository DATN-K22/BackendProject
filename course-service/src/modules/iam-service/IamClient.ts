export interface IamClient {
  findUserById(user_ids: string[]): Promise<any>
}
