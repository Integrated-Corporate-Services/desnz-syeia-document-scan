/**
 * Long-running SQS worker for local development
 * Polls SQS queue and processes messages using the Lambda handler
 */
import 'dotenv/config';
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { SQSEvent, Context } from 'aws-lambda';
import { handler } from './handler.js';
import { logInfo, logError, logWarn } from './src/utils/logger.js';

const sqsClient = new SQSClient({
  region: process.env.AWS_REGION || 'eu-west-2',
  endpoint: process.env.AWS_ENDPOINT,
  credentials: process.env.AWS_ENDPOINT ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  } : undefined,
});

const QUEUE_URL = process.env.SQS_SCAN_QUEUE_URL;
const POLL_WAIT_SECONDS = parseInt(process.env.SQS_POLL_WAIT_SECONDS || '10');
const VISIBILITY_TIMEOUT = parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '300');

let running = true;

// Graceful shutdown
process.on('SIGTERM', () => {
  logInfo('worker', 'SIGTERM received, shutting down gracefully...');
  running = false;
});

process.on('SIGINT', () => {
  logInfo('worker', 'SIGINT received, shutting down gracefully...');
  running = false;
});

async function pollQueue(): Promise<void> {
  if (!QUEUE_URL) {
    throw new Error('SQS_SCAN_QUEUE_URL environment variable is required');
  }

  logInfo('worker', 'Starting SQS poll loop', {
    queueUrl: QUEUE_URL,
    pollWaitSeconds: POLL_WAIT_SECONDS,
    visibilityTimeout: VISIBILITY_TIMEOUT,
  });

  while (running) {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: POLL_WAIT_SECONDS,
        VisibilityTimeout: VISIBILITY_TIMEOUT,
      });

      const response = await sqsClient.send(command);

      if (response.Messages && response.Messages.length > 0) {
        for (const message of response.Messages) {
          await processMessage(message);
        }
      }
    } catch (error) {
      const err = error as Error;
      logError('worker', 'Poll error', err, {
        error: err.message,
        stack: err.stack,
      });
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  logInfo('worker', 'Poll loop stopped');
}

async function processMessage(message: Message): Promise<void> {
  if (!message.Body || !message.ReceiptHandle) {
    logWarn('worker', 'Invalid message received', { messageId: message.MessageId });
    return;
  }

  const startTime = Date.now();
  logInfo('worker', 'Processing message', {
    messageId: message.MessageId,
  });

  try {
    // Convert SQS message to Lambda SQS event format
    const sqsEvent: SQSEvent = {
      Records: [
        {
          messageId: message.MessageId || 'unknown',
          receiptHandle: message.ReceiptHandle,
          body: message.Body,
          attributes: {
            ApproximateReceiveCount: message.Attributes?.ApproximateReceiveCount || '1',
            SentTimestamp: message.Attributes?.SentTimestamp || String(Date.now()),
            SenderId: message.Attributes?.SenderId || 'unknown',
            ApproximateFirstReceiveTimestamp: message.Attributes?.ApproximateFirstReceiveTimestamp || String(Date.now()),
          },
          messageAttributes: {},
          md5OfBody: message.MD5OfBody || '',
          eventSource: 'aws:sqs',
          eventSourceARN: `arn:aws:sqs:${process.env.AWS_REGION}:000000000000:scan-queue`,
          awsRegion: process.env.AWS_REGION || 'eu-west-2',
        },
      ],
    };

    // Create mock Lambda context
    const context: Context = {
      callbackWaitsForEmptyEventLoop: false,
      functionName: 'virus-scan-worker',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:virus-scan-worker',
      memoryLimitInMB: '512',
      awsRequestId: `worker-${Date.now()}`,
      logGroupName: '/local/virus-scan-worker',
      logStreamName: `worker-${Date.now()}`,
      getRemainingTimeInMillis: () => 300000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    };

    // Process using Lambda handler
    const result = await handler(sqsEvent, context);

    // Check if processing failed
    if (result.batchItemFailures && result.batchItemFailures.length > 0) {
      throw new Error('Message processing failed');
    }

    // Delete message from queue on success
    await sqsClient.send(new DeleteMessageCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: message.ReceiptHandle,
    }));

    logInfo('worker', 'Message processed and deleted', {
      messageId: message.MessageId,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    const err = error as Error;
    logError('worker', 'Message processing failed', err, {
      messageId: message.MessageId,
      duration: Date.now() - startTime,
    });
    // Message will become visible again after visibility timeout
    // After 3 failed attempts (configured in DLQ), it will move to DLQ
  }
}

// Start the worker
pollQueue().catch((error) => {
  logError('worker', 'Fatal error', error);
  process.exit(1);
});
