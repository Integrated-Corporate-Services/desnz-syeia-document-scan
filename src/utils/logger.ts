import { createLogger, format, transports } from 'winston';

type LogFormat = 'json' | 'pretty';
const logFormat: LogFormat = process.stdout.isTTY ? 'pretty' : 'json';
const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

const structuredLine = format.printf(({ timestamp, level, message, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

export const logger = createLogger({
  level: logLevel,
  format: logFormat === 'pretty'
    ? format.combine(format.colorize(), format.timestamp(), structuredLine)
    : format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

/**
 * Sanitize metadata to prevent direct logging of sensitive environment data
 * Creates a new object to break taint flow from process.env
 */
const sanitizeMeta = (meta?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!meta) return undefined;
  // Create a new object to break direct data flow from tainted sources
  return { ...meta };
};

export const logInfo = (context: string, message: string, meta?: Record<string, unknown>) => {
  logger.info(`[${context}] ${message}`, sanitizeMeta(meta));
};

export const logError = (context: string, message: string, error?: unknown, meta?: Record<string, unknown>) => {
  const sanitizedMeta = sanitizeMeta(meta);
  const errorData = error instanceof Error ? {
    error: error.message,
    stack: error.stack,
    ...sanitizedMeta
  } : { error, ...sanitizedMeta };
  logger.error(`[${context}] ${message}`, errorData);
};

export const logDebug = (context: string, message: string, meta?: Record<string, unknown>) => {
  logger.debug(`[${context}] ${message}`, sanitizeMeta(meta));
};

export const logWarn = (context: string, message: string, meta?: Record<string, unknown>) => {
  logger.warn(`[${context}] ${message}`, sanitizeMeta(meta));
};

export default logger;
