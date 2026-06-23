import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import getLogger from './utils/loggerHelper.js';

const logger = getLogger('app');

export let isReady = false;
export function setReady(value: boolean): void {
  isReady = value;
}

export async function createApp(): Promise<Application> {
  logger.info('[app.ts][createApp] STARTS');
  
  const app: Application = express();

  app.use(helmet());

  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGIN ?? false,
      methods: ['GET'],
    })
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', service: 'document-scan' });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    if (isReady) {
      res.status(200).json({ status: 'ready', service: 'document-scan' });
    } else {
      res.status(503).json({ status: 'starting', service: 'document-scan' });
    }
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found', path: req.path });
  });

  app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('[app.ts][createApp] Unhandled error', { error: err.message, stack: err.stack });
    res.status(err.statusCode ?? 500).json({
      error: err.message ?? 'Internal Server Error',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  });

  logger.info('[app.ts][createApp] ENDS');
  return app;
}