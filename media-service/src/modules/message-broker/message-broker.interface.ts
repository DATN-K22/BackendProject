export interface IMessageBroker {
  sendFileUrlForAIProcessing(document_id: string, source_uri: string, tenant_id: string): any;
}
