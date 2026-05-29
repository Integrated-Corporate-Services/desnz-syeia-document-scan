export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class FileNotFoundError extends DomainError {
  constructor(fileId: string) {
    super(`File not found: ${fileId}`);
    this.name = 'FileNotFoundError';
  }
}

export class ScanAlreadyProcessedError extends DomainError {
  constructor(eventId: string) {
    super(`Event already processed: ${eventId}`);
    this.name = 'ScanAlreadyProcessedError';
  }
}

export class VirusScanError extends DomainError {
  constructor(message: string) {
    super(`Virus scan failed: ${message}`);
    this.name = 'VirusScanError';
  }
}

export class S3OperationError extends DomainError {
  constructor(operation: string, message: string) {
    super(`S3 ${operation} failed: ${message}`);
    this.name = 'S3OperationError';
  }
}

export class DatabaseError extends DomainError {
  constructor(message: string) {
    super(`Database operation failed: ${message}`);
    this.name = 'DatabaseError';
  }
}
