import type { IUploadedFileRepository, IFileScanEventRepository, IS3Service, IClamAVClient, ProcessFileScanRequest } from '../types/scan.types.js';
import { SCAN_STATUS, SCAN_RESULT, EVENT_STATUS } from '../constants/scan.constants.js';
import { FileNotFoundError, ScanAlreadyProcessedError } from '../errors/business.errors.js';
import { getS3Config } from '../config/config.js';
import { logInfo, logError, logDebug, logWarn } from '../utils/logger.js';

export class ProcessFileScanWorkflow {
  constructor(
    private uploadedFileRepo: IUploadedFileRepository,
    private fileScanEventRepo: IFileScanEventRepository,
    private s3Service: IS3Service,
    private clamAVClient: IClamAVClient
  ) {}

  async execute(request: ProcessFileScanRequest): Promise<void> {
    const { fileId } = request;
    let { eventId } = request;

    logInfo('ProcessFileScanWorkflow', 'Starting file scan workflow', { eventId, fileId });

    logDebug('ProcessFileScanWorkflow', 'Fetching file from database', { fileId });
    const file = await this.uploadedFileRepo.findById(fileId);
    if (!file) {
      logError('ProcessFileScanWorkflow', 'File not found in database', undefined, { fileId });
      throw new FileNotFoundError(fileId);
    }

    if (file.scan_status === SCAN_STATUS.COMPLETED) {
      logInfo('ProcessFileScanWorkflow', 'File already scanned, skipping', {
        fileId,
        scanStatus: file.scan_status,
        scanResult: file.scan_result,
      });
      return;
    }

    logInfo('ProcessFileScanWorkflow', 'File record retrieved', {
      fileId,
      s3Key: file.s3_key,
      bucketName: file.bucket_name,
      filename: file.filename,
      scanStatus: file.scan_status,
    });

    if (!file.s3_key || !file.bucket_name) {
      logError('ProcessFileScanWorkflow', 'File missing S3 information', undefined, {
        fileId,
        hasS3Key: !!file.s3_key,
        hasBucketName: !!file.bucket_name,
      });
      throw new Error(`File ${fileId} missing S3 information`);
    }

    if (eventId) {
      logDebug('ProcessFileScanWorkflow', 'Checking for existing event', { eventId });
      const existingEvent = await this.fileScanEventRepo.findByEventId(eventId);
      if (existingEvent) {
        logError('ProcessFileScanWorkflow', 'Event already processed', undefined, { eventId });
        throw new ScanAlreadyProcessedError(eventId);
      }
    }

    logDebug('ProcessFileScanWorkflow', 'Recording scan event', {
      eventId,
      fileId,
      s3Key: file.s3_key,
    });
    const recorded = await this.fileScanEventRepo.recordEvent(
      fileId,
      file.s3_key,
      EVENT_STATUS.PROCESSING,
      eventId
    );

    if (!recorded) {
      logError('ProcessFileScanWorkflow', 'Failed to record event (duplicate detected)', undefined, { eventId });
      throw new ScanAlreadyProcessedError(eventId ?? fileId);
    }

    eventId = recorded.eventId;
    logInfo('ProcessFileScanWorkflow', 'Scan event recorded, starting scan', { eventId, fileId });

    // Mark PROCESSING only after S3 validation and event idempotency checks pass,
    // so a pre-scan failure can't leave the row stuck in PROCESSING. scanned_at is
    // left untouched here because it represents the scan completion timestamp.
    await this.uploadedFileRepo.updateScanStatus(
      fileId,
      SCAN_STATUS.PROCESSING,
      null,
      null,
      null,
      null
    );

    const uploadBucket = file.bucket_name;
    const uploadKey = file.s3_key;

    try {
      logDebug('ProcessFileScanWorkflow', 'Retrieving file stream from S3', {
        bucketName: uploadBucket,
        s3Key: uploadKey,
      });
      const fileStream = await this.s3Service.getFileStream(uploadBucket, uploadKey);
      logInfo('ProcessFileScanWorkflow', 'File stream retrieved successfully', { fileId });

      logInfo('ProcessFileScanWorkflow', 'Starting virus scan', { fileId, filename: file.filename });
      const scanResult = await this.clamAVClient.scanStream(fileStream);
      logInfo('ProcessFileScanWorkflow', 'Virus scan completed', {
        fileId,
        isClean: scanResult.isClean,
        virusName: scanResult.virusName,
      });

      const { cleanBucket, quarantineBucket } = getS3Config();
      if (!cleanBucket || !quarantineBucket) {
        throw new Error('S3 clean/quarantine bucket configuration is missing');
      }

      const resultLabel = scanResult.isClean ? SCAN_RESULT.CLEAN : SCAN_RESULT.INFECTED;

      // Production default: delete upload original after copy so downloads only use clean bucket.
      // KEEP_UPLOAD_ORIGINALS=true is a local-only override (does not change DB bucket_name).
      const keepUploadOriginal = process.env.KEEP_UPLOAD_ORIGINALS === 'true';

      let downloadBucket: string;

      if (scanResult.isClean) {
        // Clean files: copy to clean bucket and optionally delete from upload bucket
        const destinationBucket = cleanBucket;
        const destinationKey = uploadKey;

        logDebug('ProcessFileScanWorkflow', 'Copying clean file to segregation bucket', {
          fileId,
          sourceBucket: uploadBucket,
          sourceKey: uploadKey,
          destinationBucket,
          destinationKey,
          scanResult: resultLabel,
          keepUploadOriginal,
        });
        await this.s3Service.copyFile(
          uploadBucket,
          uploadKey,
          destinationBucket,
          destinationKey
        );
        logInfo('ProcessFileScanWorkflow', 'Clean file copied to segregation bucket', {
          fileId,
          destinationBucket,
          destinationKey,
        });

        // KEEP_UPLOAD_ORIGINALS=true keeps the original object AND the DB bucket_name on
        // the upload bucket (local SSO downloads). In production the original is deleted and
        // bucket_name points at the clean bucket.
        downloadBucket = keepUploadOriginal ? uploadBucket : destinationBucket;
      } else {
        // Infected files: keep in upload bucket, do NOT copy to quarantine
        logInfo('ProcessFileScanWorkflow', 'Infected file detected, keeping in upload bucket (not moving to quarantine)', {
          fileId,
          uploadBucket,
          uploadKey,
          virusName: scanResult.virusName,
          scanResult: resultLabel,
        });
        downloadBucket = uploadBucket;
      }

      // Persist scan result + download bucket BEFORE deleting the original, so a delete
      // failure can never leave the DB pointing at a bucket whose object no longer exists.
      logDebug('ProcessFileScanWorkflow', 'Updating database with scan results', {
        fileId,
        scanStatus: SCAN_STATUS.COMPLETED,
        scanResult: resultLabel,
        virusName: scanResult.virusName,
        bucketName: downloadBucket,
      });
      await this.uploadedFileRepo.updateScanStatus(
        fileId,
        SCAN_STATUS.COMPLETED,
        resultLabel,
        scanResult.virusName,
        new Date(),
        downloadBucket
      );

      // Event bookkeeping only: a failure here must NOT flip the file to FAILED, since the
      // scan, copy and DB update have already succeeded.
      try {
        await this.fileScanEventRepo.updateEventStatus(eventId, EVENT_STATUS.COMPLETED);
      } catch (eventUpdateError) {
        logWarn('ProcessFileScanWorkflow', 'Failed to mark scan event COMPLETED (scan already succeeded)', {
          fileId,
          eventId,
          error: (eventUpdateError as Error).message,
        });
      }

      // Only delete from upload bucket for CLEAN files (infected files always stay in upload bucket)
      if (scanResult.isClean && !keepUploadOriginal) {
        // Best-effort removal of the original now that the DB is consistent, so downloads
        // only come from clean bucket.
        try {
          await this.s3Service.deleteFile(uploadBucket, uploadKey);
          logInfo('ProcessFileScanWorkflow', 'Original removed from upload bucket', {
            fileId,
            uploadBucket,
            uploadKey,
          });
        } catch (deleteError) {
          logWarn('ProcessFileScanWorkflow', 'Failed to delete original from upload bucket (continuing)', {
            fileId,
            uploadBucket,
            uploadKey,
            error: (deleteError as Error).message,
          });
        }
      } else if (scanResult.isClean && keepUploadOriginal) {
        logInfo('ProcessFileScanWorkflow', 'Keeping original in upload bucket (KEEP_UPLOAD_ORIGINALS=true)', {
          fileId,
          uploadBucket,
          uploadKey,
        });
      } else {
        // Infected file - always kept in upload bucket
        logInfo('ProcessFileScanWorkflow', 'Infected file kept in upload bucket', {
          fileId,
          uploadBucket,
          uploadKey,
          virusName: scanResult.virusName,
        });
      }

      logInfo('ProcessFileScanWorkflow', 'File scan workflow completed successfully', {
        fileId,
        eventId,
        isClean: scanResult.isClean,
        virusName: scanResult.virusName,
        destinationBucket,
        downloadBucket,
      });
    } catch (error) {
      const err = error as Error;
      logError('ProcessFileScanWorkflow', 'File scan workflow failed', err, {
        fileId,
        eventId,
      });

      logDebug('ProcessFileScanWorkflow', 'Updating database with failure status', { fileId });
      await this.uploadedFileRepo.updateScanStatus(
        fileId,
        SCAN_STATUS.FAILED,
        null,
        null,
        new Date()
      );

      if (eventId) {
        try {
          await this.fileScanEventRepo.updateEventStatus(eventId, EVENT_STATUS.FAILED);
        } catch (eventUpdateError) {
          logWarn('ProcessFileScanWorkflow', 'Failed to mark scan event as FAILED', {
            eventId,
            error: (eventUpdateError as Error).message,
          });
        }
      }

      throw error;
    }
  }
}
