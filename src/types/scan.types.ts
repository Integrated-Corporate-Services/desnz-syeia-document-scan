export interface ScanResultResponse {
  isClean: boolean;
  virusName: string | null;
}

export interface ProcessFileScanRequest {
  fileId: string;
  /** Provided by backend SQS messages; omitted for S3 events (DB generates event_id). */
  eventId?: string;
}

export interface IClamAVClient {
  scanStream(fileStream: any): Promise<ScanResultResponse>;
}

export interface IS3Service {
  getFileStream(bucket: string, key: string): Promise<any>;
  copyFile(
    sourceBucket: string,
    sourceKey: string,
    destinationBucket: string,
    destinationKey: string
  ): Promise<void>;
}

export interface IUploadedFileRepository {
  findById(fileId: string): Promise<any>;
  findByS3Key(s3Key: string): Promise<any>;
  updateScanStatus(
    fileId: string,
    scanStatus: string,
    scanResult: string | null,
    virusName: string | null,
    scannedAt: Date
  ): Promise<void>;
}

export interface IFileScanEventRepository {
  findByEventId(eventId: string): Promise<any>;
  recordEvent(
    fileId: string,
    s3Key: string,
    status: string,
    eventId?: string
  ): Promise<{ eventId: string } | null>;
}
