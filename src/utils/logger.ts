import { createLogger, format, transports } from 'winston';

type LogFormat = 'json' | 'pretty';
const logFormat: LogFormat = process.stdout.isTTY ? 'pretty' : 'json';
const logLevel = (process.env.LOG_LEVEL).toLowerCase();

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

export const logInfo = (context: string, message: string, meta?: Record<string, any>) => {
  logger.info(`[${context}] ${message}`, meta);
};

export const logError = (context: string, message: string, error?: any, meta?: Record<string, any>) => {
  const errorData = error instanceof Error ? {
    error: error.message,
    stack: error.stack,
    ...meta
  } : { error, ...meta };
  logger.error(`[${context}] ${message}`, errorData);
};

export const logDebug = (context: string, message: string, meta?: Record<string, any>) => {
  logger.debug(`[${context}] ${message}`, meta);
};

export const logWarn = (context: string, message: string, meta?: Record<string, any>) => {
  logger.warn(`[${context}] ${message}`, meta);
};

export default logger;
