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
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const HOST = '0.0.0.0';

(async () => {
  // ── 1 + 2: HTTP server (liveness available immediately) ─────────────────
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
      logger.info(`Health: http://${HOST}:${PORT}/health`);
      logger.info(`Ready:  http://${HOST}:${PORT}/ready`);
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
  const sqsCfg = getSqsConfig();
  if (!sqsCfg.queueUrl) {
    throw new Error('SQS_SCAN_QUEUE_URL environment variable is required.');
  }
  logger.info('SQS configuration valid ✓', { queueUrl: sqsCfg.queueUrl });

  // ── 6: Mark ready ─────────────────────────────────────────────────────────
  setReady(true);
  logger.info('All startup checks passed — service is READY ✓');

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