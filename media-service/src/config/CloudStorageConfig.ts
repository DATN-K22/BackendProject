export interface CloudStorageConfig {
    configure(): void;
    getClient(): any; 
}