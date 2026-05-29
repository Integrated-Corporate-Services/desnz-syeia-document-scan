import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { logDebug, logError, logInfo } from '../../utils/logger.js';

export interface IS3Service {
  getFileStream(bucket: string, key: string): Promise<Readable>;
  moveFile(sourceBucket: string, sourceKey: string, destinationKey: string): Promise<void>;
}

export class S3Service implements IS3Service {
  private readonly context = 'S3Service';
  private client: S3Client;

  constructor() {
    const config: any = {
      region: process.env.AWS_REGION || 'eu-west-2',
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
    logInfo(this.context, 'Retrieving file stream from S3', {
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
        logError(this.context, 'S3 response has no body', undefined, {
          bucket,
          key,
        });
        throw new Error('No body in S3 response');
      }

      logInfo(this.context, 'File stream retrieved successfully', {
        bucket,
        key,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        duration,
      });

      return response.Body as Readable;
    } catch (error) {
      logError(this.context, 'Failed to retrieve file stream from S3', error as Error, {
        bucket,
        key,
      });
      throw error;
    }
  }

  async moveFile(sourceBucket: string, sourceKey: string, destinationKey: string): Promise<void> {
    logInfo(this.context, 'Moving file in S3', {
      sourceBucket,
      sourceKey,
      destinationKey,
    });

    try {
      // Step 1: Copy file to destination
      logDebug(this.context, 'Copying file to destination', {
        sourceBucket,
        sourceKey,
        destinationKey,
      });

      const copyCommand = new CopyObjectCommand({
        Bucket: sourceBucket,
        CopySource: `${sourceBucket}/${sourceKey}`,
        Key: destinationKey,
      });

      const copyStartTime = Date.now();
      await this.client.send(copyCommand);
      const copyDuration = Date.now() - copyStartTime;

      logInfo(this.context, 'File copied successfully', {
        sourceBucket,
        sourceKey,
        destinationKey,
        duration: copyDuration,
      });

      // Step 2: Delete source file
      logDebug(this.context, 'Deleting source file', {
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

      logInfo(this.context, 'File moved successfully', {
        sourceBucket,
        sourceKey,
        destinationKey,
        totalDuration: copyDuration + deleteDuration,
      });
    } catch (error) {
      logError(this.context, 'Failed to move file in S3', error as Error, {
        sourceBucket,
        sourceKey,
        destinationKey,
      });
      throw error;
    }
  }
}
