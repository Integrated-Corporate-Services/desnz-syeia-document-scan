import { logger, logInfo, logError, logDebug, logWarn } from './logger.js';

export default function getLogger(context: string) {
  return {
    info: (message: string, meta?: Record<string, any>) => logInfo(context, message, meta),
    error: (message: string, error?: any, meta?: Record<string, any>) => logError(context, message, error, meta),
    debug: (message: string, meta?: Record<string, any>) => logDebug(context, message, meta),
    warn: (message: string, meta?: Record<string, any>) => logWarn(context, message, meta),
    
    logger
  };
}
