export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

export class FileNotFoundError extends BusinessError {
  constructor(fileId: string) {
    super(`File not found: ${fileId}`);
    this.name = 'FileNotFoundError';
  }
}

export class ScanAlreadyProcessedError extends BusinessError {
  constructor(eventId: string) {
    super(`Event already processed: ${eventId}`);
    this.name = 'ScanAlreadyProcessedError';
  }
}

export class VirusScanError extends BusinessError {
  constructor(message: string) {
    super(`Virus scan failed: ${message}`);
    this.name = 'VirusScanError';
  }
}

/** Thrown when an S3 event arrives before upload confirm creates the DB row. */
export class FileRecordNotReadyError extends BusinessError {
  constructor(s3Key: string) {
    super(`Uploaded file record not ready for S3 key: ${s3Key}`);
    this.name = 'FileRecordNotReadyError';
  }
}
