/**
 * S3 Client Utilities
 * 
 * Provides S3 connectivity checking and configuration validation
 */

import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { logInfo, logError, logWarn } from '../../utils/logger.js';

const context = 'S3Client';

/**
 * Check S3 connectivity and validate bucket access
 * Verifies that required S3 buckets are accessible
 */
export async function checkS3Connectivity(): Promise<void> {
  const bucketName = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION || 'eu-west-2';

  if (!bucketName) {
    const error = new Error('S3_BUCKET_NAME environment variable is required');
    logError(context, 'S3 configuration missing', error);
    throw error;
  }

  try {
    logInfo(context, 'Checking S3 connectivity...', {
      bucket: bucketName,
      region
    });

    const client = new S3Client({ region });
    
    // Attempt to access the bucket
    await client.send(new HeadBucketCommand({
      Bucket: bucketName
    }));

    logInfo(context, 'S3 connectivity verified successfully', {
      bucket: bucketName
    });
  } catch (error: any) {
    if (error.name === 'NotFound') {
      logError(context, `S3 bucket not found: ${bucketName}`, error);
      throw new Error(`S3 bucket does not exist: ${bucketName}`);
    } else if (error.name === 'Forbidden') {
      logError(context, `Access denied to S3 bucket: ${bucketName}`, error);
      throw new Error(`No permission to access S3 bucket: ${bucketName}`);
    } else {
      logError(context, 'Failed to check S3 connectivity', error);
      throw error;
    }
  }
}

/**
 * Get configured S3 client instance
 */
export function getS3Client(): S3Client {
  const region = process.env.AWS_REGION || 'eu-west-2';
  return new S3Client({ region });
}
