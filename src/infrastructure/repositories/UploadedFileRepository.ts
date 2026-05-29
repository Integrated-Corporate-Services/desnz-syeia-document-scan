import { QueryResult } from 'pg';
import { query } from '../database/connection.js';
import type { UploadedFile } from '../../domain/entities/UploadedFile.js';
import { logDebug, logError } from '../../utils/logger.js';

export interface IUploadedFileRepository {
  findById(fileId: string): Promise<UploadedFile | null>;
  updateScanStatus(
    fileId: string,
    scanStatus: string,
    scanResult: string | null,
    virusName: string | null,
    scannedAt: Date
  ): Promise<void>;
}

export class UploadedFileRepository implements IUploadedFileRepository {
  async findById(fileId: string): Promise<UploadedFile | null> {
    logDebug('UploadedFileRepository', 'Querying database for file', { fileId });
    try {
      const result: QueryResult<UploadedFile> = await query(
        `SELECT id, storage_provider, s3_key, bucket_name, virtual_folder, 
                filename, file_content_type, file_size_bytes, uploaded_at_timestamp,
                scan_status, scan_result, virus_name, scanned_at
         FROM public.uploaded_files
         WHERE id = $1`,
        [fileId]
      );
      
      const file = result.rows[0] || null;
      if (file) {
        logDebug('UploadedFileRepository', 'File found in database', {
          fileId,
          filename: file.filename,
          scanStatus: file.scan_status,
          s3Key: file.s3_key,
          bucketName: file.bucket_name,
        });
      } else {
        logDebug('UploadedFileRepository', 'File not found in database', { fileId });
      }
      return file;
    } catch (error) {
      logError('UploadedFileRepository', 'Database query failed for findById', error as Error, { fileId });
      throw error;
    }
  }

  async updateScanStatus(
    fileId: string,
    scanStatus: string,
    scanResult: string | null,
    virusName: string | null,
    scannedAt: Date
  ): Promise<void> {
    logDebug('UploadedFileRepository', 'Updating scan status in database', {
      fileId,
      scanStatus,
      scanResult,
      virusName,
    });
    try {
      await query(
        `UPDATE public.uploaded_files
         SET scan_status = $2,
             scan_result = $3,
             virus_name = $4,
             scanned_at = $5
         WHERE id = $1`,
        [fileId, scanStatus, scanResult, virusName, scannedAt]
      );
      logDebug('UploadedFileRepository', 'Scan status updated successfully', { fileId, scanStatus });
    } catch (error) {
      logError('UploadedFileRepository', 'Database update failed for updateScanStatus', error as Error, {
        fileId,
        scanStatus,
      });
      throw error;
    }
  }
}
