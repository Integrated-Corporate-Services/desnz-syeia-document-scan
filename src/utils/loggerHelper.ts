/**
 * Logger Helper - Provides logger factory function
 * 
 * This module provides a getLogger function that returns a logger instance
 * with the specified context. This is a convenience wrapper around the
 * base logger module.
 */

import { logger, logInfo, logError, logDebug, logWarn } from './logger.js';

/**
 * Creates a logger instance with a specific context
 * @param context - The context/component name for log messages
 * @returns An object with logging methods bound to the context
 */
export default function getLogger(context: string) {
  return {
    info: (message: string, meta?: Record<string, any>) => logInfo(context, message, meta),
    error: (message: string, error?: any, meta?: Record<string, any>) => logError(context, message, error, meta),
    debug: (message: string, meta?: Record<string, any>) => logDebug(context, message, meta),
    warn: (message: string, meta?: Record<string, any>) => logWarn(context, message, meta),
    
    // Also expose raw logger for advanced use
    logger
  };
}
