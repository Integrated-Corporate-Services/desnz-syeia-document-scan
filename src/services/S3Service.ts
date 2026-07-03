import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { logDebug, logError, logInfo } from '../utils/logger.js';
import type { IS3Service } from '../types/scan.types.js';
import { AWS_CONSTANTS } from '../constants/aws.constants.js';

export class S3Service implements IS3Service {
  private readonly context = 'S3Service';
  private client: S3Client;

  constructor() {
    const config: any = {
      region: process.env.AWS_REGION || AWS_CONSTANTS.DEFAULT_REGION,
    };

    if (process.env.S3_ENDPOINT) {
      config.endpoint = process.env.S3_ENDPOINT;
      config.forcePathStyle = true;
      logDebug(this.context, 'Using custom S3 endpoint', {
        endpoint: process.env.S3_ENDPOINT,
        region: config.region,
      });
    }

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
      logDebug(this.context, 'Using AWS credentials from environment');
    }

    this.client = new S3Client(config);
    logInfo(this.context, 'S3 client initialized', {
      region: config.region,
      hasCustomEndpoint: !!process.env.S3_ENDPOINT,
    });
  }

  async getFileStream(bucket: string, key: string): Promise<Readable> {
    logInfo(this.context, '[S3Service.ts][getFileStream] STARTS', {
      bucket,
      key,
    });
    logInfo(this.context, '[S3Service.ts][getFileStream] Retrieving file stream from S3', {
      bucket,
      key,
    });

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const startTime = Date.now();
      const response = await this.client.send(command);
      const duration = Date.now() - startTime;
      
      if (!response.Body) {
        logError(this.context, '[S3Service.ts][getFileStream] S3 response has no body', undefined, {
          bucket,
          key,
        });
        logError(this.context, '[S3Service.ts][getFileStream] ENDS with error');
        throw new Error('No body in S3 response');
      }

      logInfo(this.context, '[S3Service.ts][getFileStream] File stream retrieved successfully', {
        bucket,
        key,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        duration,
      });

      logInfo(this.context, '[S3Service.ts][getFileStream] ENDS');
      return response.Body as Readable;
    } catch (error) {
      logError(this.context, '[S3Service.ts][getFileStream] Failed to retrieve file stream from S3', error as Error, {
        bucket,
        key,
      });
      logError(this.context, '[S3Service.ts][getFileStream] ENDS with error');
      throw error;
    }
  }

  async moveFile(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string
  ): Promise<void> {
    logInfo(this.context, '[S3Service.ts][moveFile] STARTS', {
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey,
    });
    logInfo(this.context, '[S3Service.ts][moveFile] Moving file in S3', {
      sourceBucket,
      sourceKey,
      destinationBucket,
      destinationKey,
    });

    try {
      logDebug(this.context, '[S3Service.ts][moveFile] Copying file to destination', {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey,
      });

      const copyCommand = new CopyObjectCommand({
        Bucket: destinationBucket,
        CopySource: `${sourceBucket}/${sourceKey}`,
        Key: destinationKey,
      });

      const copyStartTime = Date.now();
      await this.client.send(copyCommand);
      const copyDuration = Date.now() - copyStartTime;

      logInfo(this.context, '[S3Service.ts][moveFile] File copied successfully', {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey,
        duration: copyDuration,
      });

      logDebug(this.context, '[S3Service.ts][moveFile] Deleting source file', {
        sourceBucket,
        sourceKey,
      });

      const deleteCommand = new DeleteObjectCommand({
        Bucket: sourceBucket,
        Key: sourceKey,
      });

      const deleteStartTime = Date.now();
      await this.client.send(deleteCommand);
      const deleteDuration = Date.now() - deleteStartTime;

      logInfo(this.context, '[S3Service.ts][moveFile] File moved successfully', {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey,
        totalDuration: copyDuration + deleteDuration,
      });
      
      logInfo(this.context, '[S3Service.ts][moveFile] ENDS');
    } catch (error) {
      logError(this.context, '[S3Service.ts][moveFile] Failed to move file in S3', error as Error, {
        sourceBucket,
        sourceKey,
        destinationBucket,
        destinationKey,
      });
      logError(this.context, '[S3Service.ts][moveFile] ENDS with error');
      throw error;
    }
  }
}
