import { createLogger, format, transports } from 'winston';

const isCloudEnv = [
  'prod',
  'production',
  'pre-prod',
  'staging',
  'dev',
  'development'
].includes(process.env.NODE_ENV || '');

const logLevel = process.env.LOG_LEVEL || (isCloudEnv ? 'info' : 'debug');

export const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}] ${message}${metaStr}`;
    })
  ),
  transports: []
});

if (isCloudEnv) {
  logger.add(new transports.Console({
    format: format.combine(
      format.timestamp(),
      format.json()
    ),
  }));
} else {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.timestamp(),
      format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    ),
  }));
}

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
