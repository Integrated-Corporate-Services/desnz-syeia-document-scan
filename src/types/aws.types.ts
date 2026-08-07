export interface S3Config {
  region: string;
  uploadsBucket: string;
  cleanBucket: string;
  quarantineBucket: string;
  endpoint?: string; 
}

export interface SqsConfig {
  region: string;
  queueUrl: string;
  deadLetterQueueUrl: string;
  pollWaitSeconds: number;
  visibilityTimeout: number;
  endpoint?: string; 
}

export interface ClamavConfig {
  host: string;
  port: number;
  simulateScan: boolean;
}
