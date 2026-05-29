import { SQSEvent, SQSBatchResponse, SQSRecord, Context } from 'aws-lambda';
import { ProcessFileScanUseCase } from './src/application/usecases/ProcessFileScanUseCase.js';
import { UploadedFileRepository } from './src/infrastructure/repositories/UploadedFileRepository.js';
import { FileScanEventRepository } from './src/infrastructure/repositories/FileScanEventRepository.js';
import { S3Service } from './src/infrastructure/external/S3Service.js';
import { ClamAVClient } from './src/infrastructure/external/ClamAVClient.js';
import type { ScanMessage } from './src/domain/entities/ScanMessage.js';
import { logInfo, logError, logDebug } from './src/utils/logger.js';

const uploadedFileRepo = new UploadedFileRepository();
const fileScanEventRepo = new FileScanEventRepository();
const s3Service = new S3Service();
const clamAVClient = new ClamAVClient();

const processFileScanUseCase = new ProcessFileScanUseCase(
  uploadedFileRepo,
  fileScanEventRepo,
  s3Service,
  clamAVClient
);

export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  const requestId = context?.awsRequestId || 'unknown';
  const startTime = Date.now();

  logInfo('handler', 'SQS event received', {
    requestId,
    recordCount: event.Records.length,
  });

  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      await processRecord(record, requestId);
    } catch (error) {
      const err = error as Error;
      logError('handler', 'Record processing failed', err, {
        requestId,
        messageId: record.messageId,
      });

      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  logInfo('handler', 'Processing complete', {
    requestId,
    duration: Date.now() - startTime,
    failedCount: batchItemFailures.length,
  });

  return {
    batchItemFailures,
  };
};

async function processRecord(record: SQSRecord, requestId: string): Promise<void> {
  logDebug('processRecord', 'Processing message', {
    requestId,
    messageId: record.messageId,
  });

  const message: ScanMessage = JSON.parse(record.body);
  
  logInfo('processRecord', 'Parsed SQS message', {
    requestId,
    messageId: record.messageId,
    fileId: message.fileId,
    eventId: message.eventId,
  });

  await processFileScanUseCase.execute({
    eventId: message.eventId,
    fileId: message.fileId,
  });

  logInfo('processRecord', 'Message processed successfully', {
    requestId,
    messageId: record.messageId,
    fileId: message.fileId,
  });
}
