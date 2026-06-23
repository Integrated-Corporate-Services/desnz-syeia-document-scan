export class TechnicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TechnicalError';
  }
}

export class S3OperationError extends TechnicalError {
  constructor(operation: string, message: string) {
    super(`S3 ${operation} failed: ${message}`);
    this.name = 'S3OperationError';
  }
}

export class DatabaseError extends TechnicalError {
  constructor(message: string) {
    super(`Database operation failed: ${message}`);
    this.name = 'DatabaseError';
  }
}

export class SQSError extends TechnicalError {
  constructor(message: string) {
    super(`SQS operation failed: ${message}`);
    this.name = 'SQSError';
  }
}

export class ClamAVError extends TechnicalError {
  constructor(message: string) {
    super(`ClamAV operation failed: ${message}`);
    this.name = 'ClamAVError';
  }
}
