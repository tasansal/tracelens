/**
 * Shared storage configuration types.
 */

/**
 * AWS S3 configuration
 */
interface S3Config {
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
interface GcsConfig {
  serviceAccountKeyPath?: string;
  serviceAccountKey?: string;
  applicationCredentialsPath?: string;
  skipSignature?: boolean;
}

/**
 * Azure Blob Storage configuration
 */
interface AzureConfig {
  accountName: string;
  accessKey?: string;
  sasToken?: string;
  endpoint?: string;
}

/**
 * HTTP configuration
 */
interface HttpConfig {
  headers: Record<string, string>;
  timeoutSecs: number;
}

/**
 * Performance tuning configuration
 */
interface PerformanceConfig {
  chunkSizeMb: number;
  readCacheMb: number;
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
