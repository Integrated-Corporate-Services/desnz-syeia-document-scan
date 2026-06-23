import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import type { ProcessFileScanRequest } from './types/scan.types.js';
import { ProcessFileScanWorkflow } from './workflows/ProcessFileScanWorkflow.js';
import { FileScanEventRepository } from './repositories/FileScanEventRepository.js';
import { UploadedFileRepository } from './repositories/UploadedFileRepository.js';
import { S3Service } from './services/S3Service.js';
import { ClamAVService } from './services/ClamAVService.js';
import { getSqsConfig } from './config/config.js';
import { logInfo, logError, logWarn, logDebug } from './utils/logger.js';
import { WORKER_CONSTANTS } from './constants/worker.constants.js';
import { AWS_CONSTANTS } from './constants/aws.constants.js';

const context = 'SQSWorker';

let isRunning = false;
let sqsClient: SQSClient;
let processFileScanWorkflow: ProcessFileScanWorkflow;

function initializeWorker() {
  logInfo(context, '[worker.ts][initializeWorker] STARTS');
  
  const region = process.env.AWS_REGION || AWS_CONSTANTS.DEFAULT_REGION;
  sqsClient = new SQSClient({ region });

  const fileScanEventRepo = new FileScanEventRepository();
  const uploadedFileRepo = new UploadedFileRepository();
  const s3Service = new S3Service();
  const clamAVService = new ClamAVService();

  processFileScanWorkflow = new ProcessFileScanWorkflow(
    uploadedFileRepo,
    fileScanEventRepo,
    s3Service,
    clamAVService
  );
  
  logInfo(context, '[worker.ts][initializeWorker] ENDS');
}

export function startWorker(): void {
  logInfo(context, '[worker.ts][startWorker] STARTS');
  
  if (isRunning) {
    logWarn(context, '[worker.ts][startWorker] Worker already running');
    logWarn(context, '[worker.ts][startWorker] ENDS early (already running)');
    return;
  }

  logInfo(context, '[worker.ts][startWorker] Starting SQS worker...');
  isRunning = true;

  initializeWorker();

  setImmediate(() => pollLoop());

  logInfo(context, '[worker.ts][startWorker] SQS worker started successfully');
  logInfo(context, '[worker.ts][startWorker] ENDS');
}

export function stopWorker(): void {
  logInfo(context, '[worker.ts][stopWorker] STARTS');
  logInfo(context, '[worker.ts][stopWorker] Stopping SQS worker...');
  
  isRunning = false;
  
  logInfo(context, '[worker.ts][stopWorker] ENDS');
}

async function pollLoop(): Promise<void> {
  logInfo(context, '[worker.ts][pollLoop] STARTS');
  
  const sqsConfig = getSqsConfig();

  while (isRunning) {
    try {
      await pollOnce(sqsConfig.queueUrl!);
    } catch (error) {
      logError(context, '[worker.ts][pollLoop] Error in poll loop', error);
      
      await sleep(WORKER_CONSTANTS.POLL_ERROR_RETRY_DELAY_MS);
    }
  }

  logInfo(context, '[worker.ts][pollLoop] SQS worker stopped');
  logInfo(context, '[worker.ts][pollLoop] ENDS');
}

async function pollOnce(queueUrl: string): Promise<void> {
  logDebug(context, '[worker.ts][pollOnce] STARTS');
  
  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: WORKER_CONSTANTS.SQS_MAX_MESSAGES_PER_POLL,
      WaitTimeSeconds: WORKER_CONSTANTS.SQS_WAIT_TIME_SECONDS,
      VisibilityTimeout: WORKER_CONSTANTS.SQS_VISIBILITY_TIMEOUT_SECONDS
    });

    const response = await sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      logDebug(context, '[worker.ts][pollOnce] No messages received from SQS');
      logDebug(context, '[worker.ts][pollOnce] ENDS');
      return;
    }

    for (const message of response.Messages) {
      await processMessage(message, queueUrl);
    }
    
    logDebug(context, '[worker.ts][pollOnce] ENDS');
  } catch (error) {
    logError(context, '[worker.ts][pollOnce] Error polling SQS', error);
    logError(context, '[worker.ts][pollOnce] ENDS with error');
    throw error;
  }
}

async function processMessage(message: Message, queueUrl: string): Promise<void> {
  const { MessageId, Body, ReceiptHandle } = message;
  
  logInfo(context, '[worker.ts][processMessage] STARTS', { messageId: MessageId });

  try {
    if (!Body) {
      logWarn(context, '[worker.ts][processMessage] Received message with no body', { messageId: MessageId });
      logWarn(context, '[worker.ts][processMessage] ENDS early (no body)');
      return;
    }

    logInfo(context, '[worker.ts][processMessage] Processing SQS message', { messageId: MessageId });

    const scanRequest: ProcessFileScanRequest = JSON.parse(Body);

    if (!scanRequest.eventId) {
      throw new Error('Missing eventId in scan request');
    }
    if (!scanRequest.fileId) {
      throw new Error('Missing fileId in scan request');
    }

    await processFileScanWorkflow.execute({
      eventId: scanRequest.eventId,
      fileId: scanRequest.fileId
    });

    logInfo(context, '[worker.ts][processMessage] Successfully processed scan request', {
      messageId: MessageId,
      eventId: scanRequest.eventId,
      fileId: scanRequest.fileId
    });

    if (ReceiptHandle) {
      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle
      }));
      logDebug(context, '[worker.ts][processMessage] Message deleted from queue', { messageId: MessageId });
    }
    
    logInfo(context, '[worker.ts][processMessage] ENDS');
  } catch (error) {
    logError(context, '[worker.ts][processMessage] Error processing message', error, { messageId: MessageId });
    logError(context, '[worker.ts][processMessage] ENDS with error');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
