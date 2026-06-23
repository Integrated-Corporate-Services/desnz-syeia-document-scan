import type { IUploadedFileRepository, IFileScanEventRepository, IS3Service, IClamAVClient, ProcessFileScanRequest } from '../types/scan.types.js';
import { SCAN_STATUS, SCAN_RESULT, S3_FOLDERS, EVENT_STATUS } from '../constants/scan.constants.js';
import { FileNotFoundError, ScanAlreadyProcessedError } from '../errors/business.errors.js';
import { logInfo, logError, logDebug } from '../utils/logger.js';

export class ProcessFileScanWorkflow {
  constructor(
    private uploadedFileRepo: IUploadedFileRepository,
    private fileScanEventRepo: IFileScanEventRepository,
    private s3Service: IS3Service,
    private clamAVClient: IClamAVClient
  ) {}

  async execute(request: ProcessFileScanRequest): Promise<void> {
    const { eventId, fileId } = request;

    logInfo('ProcessFileScanWorkflow', 'Starting file scan workflow', { eventId, fileId });

    // Check if event already processed
    logDebug('ProcessFileScanWorkflow', 'Checking for existing event', { eventId });
    const existingEvent = await this.fileScanEventRepo.findByEventId(eventId);
    if (existingEvent) {
      logError('ProcessFileScanWorkflow', 'Event already processed', undefined, { eventId });
      throw new ScanAlreadyProcessedError(eventId);
    }

    // Fetch file record from database
    logDebug('ProcessFileScanWorkflow', 'Fetching file from database', { fileId });
    const file = await this.uploadedFileRepo.findById(fileId);
    if (!file) {
      logError('ProcessFileScanWorkflow', 'File not found in database', undefined, { fileId });
      throw new FileNotFoundError(fileId);
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

    // Record the scan event
    logDebug('ProcessFileScanWorkflow', 'Recording scan event', {
      eventId,
      fileId,
      s3Key: file.s3_key,
    });
    const isRecorded = await this.fileScanEventRepo.recordEvent(
      eventId,
      fileId,
      file.s3_key,
      EVENT_STATUS.PROCESSING
    );

    if (!isRecorded) {
      logError('ProcessFileScanWorkflow', 'Failed to record event (duplicate detected)', undefined, { eventId });
      throw new ScanAlreadyProcessedError(eventId);
    }

    logInfo('ProcessFileScanWorkflow', 'Scan event recorded, starting scan', { eventId, fileId });

    try {
      // Get file from S3
      logDebug('ProcessFileScanWorkflow', 'Retrieving file stream from S3', {
        bucketName: file.bucket_name,
        s3Key: file.s3_key,
      });
      const fileStream = await this.s3Service.getFileStream(file.bucket_name, file.s3_key);
      logInfo('ProcessFileScanWorkflow', 'File stream retrieved successfully', { fileId });

      // Scan the file
      logInfo('ProcessFileScanWorkflow', 'Starting virus scan', { fileId, filename: file.filename });
      const scanResult = await this.clamAVClient.scanStream(fileStream);
      logInfo('ProcessFileScanWorkflow', 'Virus scan completed', {
        fileId,
        isClean: scanResult.isClean,
        virusName: scanResult.virusName,
      });

      // Determine destination folder
      const destinationFolder = scanResult.isClean ? S3_FOLDERS.CLEAN : S3_FOLDERS.INFECTED;
      const destinationKey = `${destinationFolder}/${file.s3_key}`;

      // Move file to appropriate folder
      logDebug('ProcessFileScanWorkflow', 'Moving file to destination folder', {
        fileId,
        sourceBucket: file.bucket_name,
        sourceKey: file.s3_key,
        destinationKey,
        scanResult: scanResult.isClean ? 'CLEAN' : 'INFECTED',
      });
      await this.s3Service.moveFile(file.bucket_name, file.s3_key, destinationKey);
      logInfo('ProcessFileScanWorkflow', 'File moved successfully', { fileId, destinationKey });

      // Update database with scan results
      logDebug('ProcessFileScanWorkflow', 'Updating database with scan results', {
        fileId,
        scanStatus: SCAN_STATUS.COMPLETED,
        scanResult: scanResult.isClean ? SCAN_RESULT.CLEAN : SCAN_RESULT.INFECTED,
        virusName: scanResult.virusName,
      });
      await this.uploadedFileRepo.updateScanStatus(
        fileId,
        SCAN_STATUS.COMPLETED,
        scanResult.isClean ? SCAN_RESULT.CLEAN : SCAN_RESULT.INFECTED,
        scanResult.virusName,
        new Date()
      );

      logInfo('ProcessFileScanWorkflow', 'File scan workflow completed successfully', {
        fileId,
        eventId,
        isClean: scanResult.isClean,
        virusName: scanResult.virusName,
      });
    } catch (error) {
      const err = error as Error;
      logError('ProcessFileScanWorkflow', 'File scan workflow failed', err, {
        fileId,
        eventId,
      });

      // Update database with failure status
      logDebug('ProcessFileScanWorkflow', 'Updating database with failure status', { fileId });
      await this.uploadedFileRepo.updateScanStatus(
        fileId,
        SCAN_STATUS.FAILED,
        null,
        null,
        new Date()
      );

      throw error;
    }
  }
}
