export interface S3Config {
  region: string;
  uploadsBucket: string;
  cleanBucket: string;
  quarantineBucket: string;
}

export interface SqsConfig {
  region: string;
  queueUrl: string;
  deadLetterQueueUrl: string;
  pollWaitSeconds: number;
  visibilityTimeout: number;
}

export interface ClamavConfig {
  host: string;
  port: number;
  simulateScan: boolean;
}
