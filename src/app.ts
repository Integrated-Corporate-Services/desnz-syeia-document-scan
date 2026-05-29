/**
 * Express application factory — desnz-syeia-document-scan
 *
 * Pattern mirrors document-management-service/src/app.ts:
 *   createApp() builds and returns a configured Express Application.
 *   server.ts calls createApp() then binds the HTTP server to a port.
 *
 * Why does a background worker need an HTTP server?
 * ─────────────────────────────────────────────────
 * The ECS task needs a health-check endpoint so the ECS agent and ALB
 * (if used) can verify the container is running.  The HTTP server only
 * serves /health and /ready — it does NOT process scans.  Scanning is
 * handled by the SQS poll loop started in server.ts after createApp().
 *
 * Routes:
 *   GET /health  → liveness  (always 200 while process is up)
 *   GET /ready   → readiness (200 once DB + SQS connected, 503 otherwise)
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import getLogger from './utils/loggerHelper.js';

const logger = getLogger('app');

// Readiness flag — set to true by server.ts after initPool() + SQS checks pass
export let isReady = false;
export function setReady(value: boolean): void {
  isReady = value;
}

export async function createApp(): Promise<Application> {
  const app: Application = express();

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS (locked to same-origin; no browser clients call this service) ───
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGIN ?? false,
      methods: ['GET'],
    })
  );

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));

  // ── Health / readiness ───────────────────────────────────────────────────

  /**
   * Liveness probe — ECS container health check
   * Returns 200 as long as the Node process is running.
   * Used in Dockerfile HEALTHCHECK (for ECS task replacement on crash).
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', service: 'document-scan' });
  });

  /**
   * Readiness probe — only returns 200 once startup checks have passed.
   * Set HEALTHCHECK in Dockerfile to /health (liveness).
   * Use /ready in ECS task definition health check if ALB target group is used.
   */
  app.get('/ready', (_req: Request, res: Response) => {
    if (isReady) {
      res.status(200).json({ status: 'ready', service: 'document-scan' });
    } else {
      res.status(503).json({ status: 'starting', service: 'document-scan' });
    }
  });

  // ── 404 ──────────────────────────────────────────────────────────────────
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  // ── Global error handler ─────────────────────────────────────────────────
  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(err.statusCode ?? 500).json({
      error: err.message ?? 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  });

  return app;
}