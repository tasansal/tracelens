/**
 * Shared storage configuration types.
 */

/**
 * AWS S3 configuration
 */
export interface S3Config {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  endpoint?: string;
  skipSignature?: boolean;
}

/**
 * Google Cloud Storage configuration
 */
export interface GcsConfig {
  serviceAccountKeyPath?: string;
  serviceAccountKey?: string;
  applicationCredentialsPath?: string;
  skipSignature?: boolean;
}

/**
 * Azure Blob Storage configuration
 */
export interface AzureConfig {
  accountName: string;
  accessKey?: string;
  sasToken?: string;
  endpoint?: string;
}

/**
 * HTTP configuration
 */
export interface HttpConfig {
  headers: Record<string, string>;
  timeoutSecs: number;
}

/**
 * Performance tuning configuration
 */
export interface PerformanceConfig {
  chunkSizeMb: number;
  sparseThreshold: number;
  renderChunkTraces: number;
}

/**
 * Complete storage configuration
 */
export interface StorageConfig {
  awsS3?: S3Config;
  gcpGcs?: GcsConfig;
  azureBlob?: AzureConfig;
  http?: HttpConfig;
  performance: PerformanceConfig;
}
