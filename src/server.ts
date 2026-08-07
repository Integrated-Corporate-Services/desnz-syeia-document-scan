import express from 'express';
import http from 'http';
import { createApp, setReady } from './app.js';
import { getPool, testConnection, closePool } from './config/databasePool.js';
import { checkS3Connectivity } from './config/s3Client.js';
import { startWorker, stopWorker } from './worker.js';
import { getSqsConfig } from './config/config.js';
import getLogger from './utils/loggerHelper.js';

const logger = getLogger('server');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3004;
const HOST = '0.0.0.0';

(async () => {
  logger.info('[server.ts][main] STARTS');
  
  logger.info('='.repeat(80));
  logger.info('DOCUMENT SCAN SERVICE - STARTUP CONFIGURATION');
  logger.info('='.repeat(80));
  
  logger.info('Environment Variables Loaded:', {
    NODE_ENV: process.env.NODE_ENV || '',
    AWS_REGION: process.env.AWS_REGION || process.env.AWS_Region,
    PORT: PORT,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });
  
  logger.info('Database Configuration:', {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    DB_CREDENTIALS: process.env.DB_CREDENTIALS ? '***SET***' : undefined,
    DB_SSLMODE: process.env.DB_SSLMODE,
    DB_POOL_SIZE: process.env.DB_POOL_SIZE,
  });
  
  logger.info('S3 Configuration:', {
    UPLOAD_BUCKET: process.env.UPLOAD_BUCKET,
    CLEAN_BUCKET: process.env.CLEAN_BUCKET,
    QUARANTINE_BUCKET: process.env.QUARANTINE_BUCKET,
  });
  
  logger.info('SQS Configuration:', {
    SQS_QUEUE_URL: process.env.SQS_QUEUE_URL,
  });
  
  logger.info('ClamAV Configuration:', {
    CLAMAV_HOST: process.env.CLAMAV_HOST,
    CLAMAV_PORT: process.env.CLAMAV_PORT,
    SIMULATE_SCAN: process.env.SIMULATE_SCAN,
  });
  
  logger.info('='.repeat(80));
  
  logger.info('[server.ts][main] Starting HTTP server...');
  const wrapper = express();

  wrapper.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy', service: 'document-scan' });
  });

  const mainApp = await createApp();
  wrapper.use('/', mainApp);

  const server = http.createServer(wrapper);

  await new Promise<void>((resolve) => {
    server.listen(PORT, HOST, () => {
      logger.info('[server.ts][main] Document Scan service listening on http://' + HOST + ':' + PORT);
      logger.info('[server.ts][main]    Health endpoint: http://' + HOST + ':' + PORT + '/health');
      logger.info('[server.ts][main]    Ready endpoint:  http://' + HOST + ':' + PORT + '/ready');
      resolve();
    });
  });

  logger.info('[server.ts][main] Initialising database connection pool…');
  getPool();
  logger.info('[server.ts][main] Database pool created, testing connection…');
  await testConnection();
  logger.info('[server.ts][main] Database connection verified successfully');

  logger.info('[server.ts][main] Checking S3 configuration…');
  await checkS3Connectivity();

  logger.info('[server.ts][main] Validating SQS configuration…');
  const sqsCfg = getSqsConfig();
  if (!sqsCfg.queueUrl) {
    throw new Error('SQS queue URL is required but not configured.');
  }
  logger.info('[server.ts][main] SQS configuration valid', { queueUrl: sqsCfg.queueUrl });

  setReady(true);
  logger.info('='.repeat(80));
  logger.info('ALL STARTUP CHECKS PASSED - SERVICE IS READY');
  logger.info('='.repeat(80));

  logger.info('[server.ts][main] Starting SQS poll loop…');
  startWorker();
  
  logger.info('[server.ts][main] ENDS');

  const shutdown = async (signal: string) => {
    logger.info(`[server.ts][shutdown] STARTS with signal: ${signal}`);
    logger.info(`[server.ts][shutdown] ${signal} received — shutting down gracefully…`);

    setReady(false);
    stopWorker();

    server.close(() => {
      logger.info('[server.ts][shutdown] HTTP server closed');
    });

    await closePool();
    logger.info('[server.ts][shutdown] Shutdown complete');
    logger.info('[server.ts][shutdown] ENDS');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch((err: Error) => {
  console.error('[server.ts][main] FATAL: Startup failed:', err.message, err.stack);
  console.error('[server.ts][main] ENDS with fatal error');
  process.exit(1);
});