/**
 * Server entry point — desnz-syeia-document-scan
 *
 * Pattern mirrors document-management-service/src/server.ts.
 *
 * Startup sequence (order matters):
 *  1. Build Express app (createApp) — health endpoint available immediately
 *  2. Bind HTTP server on PORT — ECS health check can respond during startup
 *  3. Initialise DB pool          — fail-fast if RDS unreachable
 *  4. Verify S3 bucket config     — fail-fast if buckets not configured
 *  5. Verify SQS queue config     — fail-fast if queue URL missing
 *  6. Set isReady = true          — /ready returns 200
 *  7. Start SQS poll loop         — begin processing scan messages
 *
 * Graceful shutdown (SIGTERM from ECS):
 *  - Stop accepting new SQS messages (running = false in poll loop)
 *  - Drain DB pool
 *  - Close HTTP server
 *  - process.exit(0)
 */

import express from 'express';
import http from 'http';
import { createApp, setReady } from './app.js';
import { initPool, closePool } from './infrastructure/database/db.js';
import { checkS3Connectivity } from './infrastructure/external/s3Client.js';
import { startWorker, stopWorker } from './worker.js';
import { getSqsConfig } from './config/config.js';
import getLogger from './utils/loggerHelper.js';

const logger = getLogger('server');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3004;
const HOST = '0.0.0.0';

(async () => {
  // ── 0: Environment Variables Logging ─────────────────────────────────────
  logger.info('='.repeat(80));
  logger.info('DOCUMENT SCAN SERVICE - STARTUP CONFIGURATION');
  logger.info('='.repeat(80));
  
  logger.info('Environment Variables Loaded:', {
    NODE_ENV: process.env.NODE_ENV || '(not set)',
    AWS_REGION: process.env.AWS_REGION || process.env.AWS_Region || '(not set)',
    PORT: PORT,
    LOG_LEVEL: process.env.LOG_LEVEL || '(not set)',
  });
  
  logger.info('Database Configuration:', {
    DB_HOST: process.env.DB_HOST || '(not set)',
    DB_PORT: process.env.DB_PORT || '(not set)',
    DB_NAME: process.env.DB_NAME || '(not set)',
    DB_CREDENTIALS: process.env.DB_CREDENTIALS ? '***SET***' : '(not set)',
    DB_SSLMODE: process.env.DB_SSLMODE || '(not set)',
    DB_POOL_SIZE: process.env.DB_POOL_SIZE || '(not set)',
    PGHOST: process.env.PGHOST || '(not set - fallback)',
    PGPORT: process.env.PGPORT || '(not set - fallback)',
    PGDATABASE: process.env.PGDATABASE || '(not set - fallback)',
  });
  
  logger.info('S3 Configuration:', {
    S3_UPLOADS_BUCKET: process.env.S3_UPLOADS_BUCKET || '(not set)',
    UPLOAD_BUCKET: process.env.UPLOAD_BUCKET || '(not set)',
    S3_CLEAN_BUCKET: process.env.S3_CLEAN_BUCKET || '(not set)',
    CLEAN_BUCKET: process.env.CLEAN_BUCKET || '(not set)',
    S3_QUARANTINE_BUCKET: process.env.S3_QUARANTINE_BUCKET || '(not set)',
    QUARANTINE_BUCKET: process.env.QUARANTINE_BUCKET || '(not set)',
  });
  
  logger.info('SQS Configuration:', {
    SQS_SCAN_QUEUE_URL: process.env.SQS_SCAN_QUEUE_URL || '(not set)',
    SQS_QUEUE_URL: process.env.SQS_QUEUE_URL || '(not set)',
  });
  
  logger.info('ClamAV Configuration:', {
    CLAMAV_HOST: process.env.CLAMAV_HOST || 'localhost (default)',
    CLAMAV_PORT: process.env.CLAMAV_PORT || '3310 (default)',
    SIMULATE_SCAN: process.env.SIMULATE_SCAN || 'false (default)',
  });
  
  logger.info('='.repeat(80));
  
  // ── 1 + 2: HTTP server (liveness available immediately) ─────────────────
  logger.info('Starting HTTP server...');
  const wrapper = express();

  wrapper.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy', service: 'document-scan' });
  });

  const mainApp = await createApp();
  wrapper.use('/', mainApp);

  const server = http.createServer(wrapper);

  await new Promise<void>((resolve) => {
    server.listen(PORT, HOST, () => {
      logger.info(`Document Scan service listening on http://${HOST}:${PORT}`);
      logger.info(`   Health endpoint: http://${HOST}:${PORT}/health`);
      logger.info(`   Ready endpoint:  http://${HOST}:${PORT}/ready`);
      resolve();
    });
  });

  // ── 3: DB pool ───────────────────────────────────────────────────────────
  logger.info('Initialising database connection pool…');
  await initPool();

  // ── 4: S3 ────────────────────────────────────────────────────────────────
  logger.info('Checking S3 configuration…');
  await checkS3Connectivity();

  // ── 5: SQS config validation ─────────────────────────────────────────────
  logger.info('Validating SQS configuration…');
  const sqsCfg = getSqsConfig();
  if (!sqsCfg.queueUrl) {
    throw new Error('SQS queue URL is required but not configured. Check SQS_SCAN_QUEUE_URL or SQS_QUEUE_URL environment variable.');
  }
  logger.info('SQS configuration valid', { queueUrl: sqsCfg.queueUrl });

  // ── 6: Mark ready ─────────────────────────────────────────────────────────
  setReady(true);
  logger.info('='.repeat(80));
  logger.info('ALL STARTUP CHECKS PASSED - SERVICE IS READY');
  logger.info('='.repeat(80));

  // ── 7: Start SQS worker poll loop ─────────────────────────────────────────
  logger.info('Starting SQS poll loop…');
  startWorker(); // non-blocking — runs its own async loop

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully…`);

    setReady(false);
    stopWorker(); // signals poll loop to exit after current message

    server.close(() => {
      logger.info('HTTP server closed');
    });

    await closePool();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})().catch((err: Error) => {
  // Any startup failure → log and exit so ECS restarts the task
  console.error('[FATAL] Startup failed:', err.message, err.stack);
  process.exit(1);
});