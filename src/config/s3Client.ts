import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { logInfo, logError, logWarn, logDebug } from '../utils/logger.js';
import { getS3Config } from './config.js';
import { AWS_CONSTANTS } from '../constants/aws.constants.js';

const context = 'S3Client';

export async function checkS3Connectivity(): Promise<void> {
  const s3Config = getS3Config();
  
  logInfo(context, 'Checking S3 connectivity for all buckets...');
  
  const missingBuckets: string[] = [];
  if (!s3Config.uploadsBucket) missingBuckets.push('S3_UPLOADS_BUCKET or UPLOAD_BUCKET');
  if (!s3Config.cleanBucket) missingBuckets.push('S3_CLEAN_BUCKET or CLEAN_BUCKET');
  if (!s3Config.quarantineBucket) missingBuckets.push('S3_QUARANTINE_BUCKET or QUARANTINE_BUCKET');
  
  if (missingBuckets.length > 0) {
    const error = new Error(`Missing required S3 bucket configuration: ${missingBuckets.join(', ')}`);
    logError(context, 'S3 configuration incomplete', error);
    throw error;
  }

  const bucketsToCheck = [
    { name: s3Config.uploadsBucket, purpose: 'uploads' },
    { name: s3Config.cleanBucket, purpose: 'clean files' },
    { name: s3Config.quarantineBucket, purpose: 'quarantine' },
  ];

  const client = new S3Client({ region: s3Config.region });
  
  for (const bucket of bucketsToCheck) {
    try {
      logInfo(context, `Checking access to ${bucket.purpose} bucket: ${bucket.name}...`);
      
      const startTime = Date.now();
      await client.send(new HeadBucketCommand({ Bucket: bucket.name }));
      const duration = Date.now() - startTime;
      
      logInfo(context, `Successfully accessed ${bucket.purpose} bucket`, {
        bucketName: bucket.name,
        responseTime: `${duration}ms`,
      });
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        logError(context, `S3 bucket not found: ${bucket.name} (${bucket.purpose})`, error);
        throw new Error(`S3 bucket does not exist: ${bucket.name}`);
      } else if (error.name === 'Forbidden' || error.$metadata?.httpStatusCode === 403) {
        logError(context, `Access denied to S3 bucket: ${bucket.name} (${bucket.purpose})`, error);
        throw new Error(`No permission to access S3 bucket: ${bucket.name}. Check IAM role permissions.`);
      } else {
        logError(context, `Failed to check S3 connectivity for ${bucket.purpose} bucket`, error);
        throw error;
      }
    }
  }
  
  logInfo(context, 'All S3 buckets are accessible and connectivity verified successfully');
}

export function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'eu-west-2';
  return new S3Client({ region });
}
