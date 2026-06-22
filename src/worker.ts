/**
 * SQS Worker - Background processor for virus scanning tasks
 * 
 * This module handles the SQS polling loop that receives scan requests,
 * processes them through the ProcessFileScanUseCase, and manages the
 * worker lifecycle.
 */

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { ProcessFileScanUseCase } from './application/usecases/ProcessFileScanUseCase.js';
import { FileScanEventRepository } from './infrastructure/repositories/FileScanEventRepository.js';
import { UploadedFileRepository } from './infrastructure/repositories/UploadedFileRepository.js';
import { S3Service } from './infrastructure/external/S3Service.js';
import { ClamAVClient } from './infrastructure/external/ClamAVClient.js';
import { getSqsConfig } from './config/config.js';
import { logInfo, logError, logWarn, logDebug } from './utils/logger.js';

const context = 'SQSWorker';

let isRunning = false;
let sqsClient: SQSClient;
let processFileScanUseCase: ProcessFileScanUseCase;

/**
 * Initialize the worker dependencies
 */
function initializeWorker() {
  const region = process.env.AWS_REGION || 'eu-west-2';
  sqsClient = new SQSClient({ region });

  // Initialize use case with dependencies
  const fileScanEventRepo = new FileScanEventRepository();
  const uploadedFileRepo = new UploadedFileRepository();
  const s3Service = new S3Service();
  const clamAVClient = new ClamAVClient();

  processFileScanUseCase = new ProcessFileScanUseCase(
    uploadedFileRepo,
    fileScanEventRepo,
    s3Service,
    clamAVClient
  );
}

/**
 * Start the SQS polling worker
 * Begins polling SQS queue for scan messages and processing them
 */
export function startWorker(): void {
  if (isRunning) {
    logWarn(context, 'Worker already running');
    return;
  }

  logInfo(context, 'Starting SQS worker...');
  isRunning = true;

  initializeWorker();

  // Start the polling loop
  setImmediate(() => pollLoop());

  logInfo(context, 'SQS worker started successfully');
}

/**
 * Stop the SQS polling worker
 * Signals the poll loop to stop after completing current message
 */
export function stopWorker(): void {
  logInfo(context, 'Stopping SQS worker...');
  isRunning = false;
}

/**
 * Main polling loop - continuously polls SQS for messages
 */
async function pollLoop(): Promise<void> {
  const sqsConfig = getSqsConfig();

  while (isRunning) {
    try {
      await pollOnce(sqsConfig.queueUrl!);
    } catch (error) {
      logError(context, 'Error in poll loop', error);
      
      // Wait before retrying to avoid tight error loop
      await sleep(5000);
    }
  }

  logInfo(context, 'SQS worker stopped');
}

/**
 * Poll SQS once for messages
 */
async function pollOnce(queueUrl: string): Promise<void> {
  try {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20, // Long polling
      VisibilityTimeout: 60
    });

    const response = await sqsClient.send(command);

    if (!response.Messages || response.Messages.length === 0) {
      logDebug(context, 'No messages received from SQS');
      return;
    }

    for (const message of response.Messages) {
      await processMessage(message, queueUrl);
    }
  } catch (error) {
    logError(context, 'Error polling SQS', error);
    throw error;
  }
}

/**
 * Process a single SQS message
 */
async function processMessage(message: Message, queueUrl: string): Promise<void> {
  const { MessageId, Body, ReceiptHandle } = message;

  try {
    if (!Body) {
      logWarn(context, 'Received message with no body', { messageId: MessageId });
      return;
    }

    logInfo(context, 'Processing SQS message', { messageId: MessageId });

    // Parse message body
    const scanRequest = JSON.parse(Body);

    // Validate required fields
    if (!scanRequest.eventId) {
      throw new Error('Missing eventId in scan request');
    }
    if (!scanRequest.fileId) {
      throw new Error('Missing fileId in scan request');
    }

    // Execute scan use case
    await processFileScanUseCase.execute({
      eventId: scanRequest.eventId,
      fileId: scanRequest.fileId
    });

    logInfo(context, 'Successfully processed scan request', {
      messageId: MessageId,
      eventId: scanRequest.eventId,
      fileId: scanRequest.fileId
    });

    // Delete message from queue
    if (ReceiptHandle) {
      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle
      }));
      logDebug(context, 'Message deleted from queue', { messageId: MessageId });
    }
  } catch (error) {
    logError(context, 'Error processing message', error, { messageId: MessageId });
    
    // Message will become visible again after visibility timeout
    // SQS DLQ (Dead Letter Queue) should be configured to handle repeated failures
  }
}

/**
 * Utility function to sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
