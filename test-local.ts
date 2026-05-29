import 'dotenv/config';
import { handler } from './handler.js';
import { SQSEvent, Context } from 'aws-lambda';

async function runLocalTest() {
  const testEvent: SQSEvent = {
    Records: [
      {
        messageId: 'test-message-1',
        receiptHandle: 'test-receipt-handle',
        body: JSON.stringify({
          eventId: 'e1e2e3e4-e5e6-e7e8-e9ea-ebecedeeeff0',
          fileId: 'a0b1c2d3-e4f5-6789-0abc-def123456789'
        }),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: String(Date.now()),
          SenderId: 'test-sender',
          ApproximateFirstReceiveTimestamp: String(Date.now())
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:eu-west-2:123456789012:test-queue',
        awsRegion: 'eu-west-2'
      }
    ]
  };

  const context: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'virus-scan-lambda',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:eu-west-2:123456789012:function:virus-scan-lambda',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/virus-scan-lambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {}
  };

  try {
    console.log('Starting local test...');
    const result = await handler(testEvent, context);
    console.log('Test completed successfully');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runLocalTest();
