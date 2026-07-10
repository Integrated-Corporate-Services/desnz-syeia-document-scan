import { QueryResult } from 'pg';
import { query } from '../config/databasePool.js';
import type { UploadedFile } from '../types/UploadedFile.js';
import type { IUploadedFileRepository } from '../types/scan.types.js';
import { UPLOADED_FILE_QUERIES } from '../queries/scan.queries.js';
import { logDebug, logError } from '../utils/logger.js';

export class UploadedFileRepository implements IUploadedFileRepository {
  private readonly context = 'UploadedFileRepository';

  async findById(fileId: string): Promise<UploadedFile | null> {
    logDebug(this.context, '[UploadedFileRepository.ts][findById] STARTS', { fileId });
    logDebug(this.context, '[UploadedFileRepository.ts][findById] Querying database for file', { fileId });
    
    try {
      const result: QueryResult<UploadedFile> = await query(
        UPLOADED_FILE_QUERIES.FIND_BY_ID,
        [fileId]
      );
      
      const file = result.rows[0] || null;
      if (file) {
        logDebug(this.context, '[UploadedFileRepository.ts][findById] File found in database', {
          fileId,
          filename: file.filename,
          scanStatus: file.scan_status,
          s3Key: file.s3_key,
          bucketName: file.bucket_name,
        });
      } else {
        logDebug(this.context, '[UploadedFileRepository.ts][findById] File not found in database', { fileId });
      }
      
      logDebug(this.context, '[UploadedFileRepository.ts][findById] ENDS');
      return file;
    } catch (error) {
      logError(this.context, '[UploadedFileRepository.ts][findById] Database query failed for findById', error as Error, { fileId });
      logError(this.context, '[UploadedFileRepository.ts][findById] ENDS with error');
      throw error;
    }
  }

  async findByS3Key(s3Key: string): Promise<UploadedFile | null> {
    logDebug(this.context, '[UploadedFileRepository.ts][findByS3Key] STARTS', { s3Key });

    try {
      const result: QueryResult<UploadedFile> = await query(
        UPLOADED_FILE_QUERIES.FIND_BY_S3_KEY,
        [s3Key]
      );

      const file = result.rows[0] || null;
      if (file) {
        logDebug(this.context, '[UploadedFileRepository.ts][findByS3Key] File found in database', {
          fileId: file.id,
          s3Key: file.s3_key,
        });
      } else {
        logDebug(this.context, '[UploadedFileRepository.ts][findByS3Key] File not found in database', { s3Key });
      }

      return file;
    } catch (error) {
      logError(this.context, '[UploadedFileRepository.ts][findByS3Key] Database query failed', error as Error, { s3Key });
      throw error;
    }
  }

  async findByS3KeyVariants(keyVariants: string[]): Promise<UploadedFile | null> {
    for (const s3Key of keyVariants) {
      const file = await this.findByS3Key(s3Key);
      if (file) {
        return file;
      }
    }
    return null;
  }

  async updateScanStatus(
    fileId: string,
    scanStatus: string,
    scanResult: string | null,
    virusName: string | null,
    scannedAt: Date,
    bucketName?: string | null
  ): Promise<void> {
    logDebug(this.context, '[UploadedFileRepository.ts][updateScanStatus] STARTS', {
      fileId,
      scanStatus,
      scanResult,
      virusName,
      bucketName,
    });
    logDebug(this.context, '[UploadedFileRepository.ts][updateScanStatus] Updating scan status in database', {
      fileId,
      scanStatus,
      scanResult,
      virusName,
      bucketName,
    });
    
    try {
      await query(
        UPLOADED_FILE_QUERIES.UPDATE_SCAN_STATUS,
        [fileId, scanStatus, scanResult, virusName, scannedAt, bucketName ?? null]
      );
      
      logDebug(this.context, '[UploadedFileRepository.ts][updateScanStatus] Scan status updated successfully', { fileId, scanStatus });
      logDebug(this.context, '[UploadedFileRepository.ts][updateScanStatus] ENDS');
    } catch (error) {
      logError(this.context, '[UploadedFileRepository.ts][updateScanStatus] Database update failed for updateScanStatus', error as Error, {
        fileId,
        scanStatus,
      });
      logError(this.context, '[UploadedFileRepository.ts][updateScanStatus] ENDS with error');
      throw error;
    }
  }
}
