// CloudStorageConfigInitializer.ts
import { CloudStorageConfig } from "./CloudStorageConfig";

export class CloudStorageConfigInitializer {
  private currentConfig: CloudStorageConfig | null = null;

  constructor(
    private readonly configs: Map<string, CloudStorageConfig>,
    private readonly provider: string,
  ) {}

  init(): void {
    const config = this.configs.get(this.provider);

    if (!config) {
      throw new Error(`Unsupported cloud provider: ${this.provider}`);
    }

    config.configure();
    this.currentConfig = config;
  }

  getCurrentConfig(): CloudStorageConfig {
    if (!this.currentConfig) {
      throw new Error('Cloud storage is not initialized. Call init() first.');
    }
    return this.currentConfig;
  }
}