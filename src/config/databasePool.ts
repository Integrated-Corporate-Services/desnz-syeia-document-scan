import { Pool, QueryResult, QueryResultRow } from 'pg';
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js';
import poolManager from './dbPoolManager.js';
import { DATABASE_CONSTANTS } from '../constants/database.constants.js';

const context = 'DatabasePool';

export function getPool(): Pool {
  logDebug(context, '[databasePool.ts][getPool] STARTS');
  
  // The pool manager will create the pool lazily on first access
  // We need to handle this synchronously for backwards compatibility
  // The pool will be created on first query
  
  // For now, we'll throw an error if pool isn't initialized
  // In practice, async init via poolManager.getPool() should be used
  throw new Error('Use async getPoolAsync() instead of getPool() for automatic password rotation support');
}

/**
 * Get pool asynchronously (recommended)
 * Supports automatic password rotation
 */
export async function getPoolAsync(): Promise<Pool> {
  logDebug(context, '[databasePool.ts][getPoolAsync] Getting pool from manager');
  return await poolManager.getPool();
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
  retries: number = DATABASE_CONSTANTS.MAX_RETRY_ATTEMPTS
): Promise<QueryResult<T>> {
  logDebug(context, '[databasePool.ts][query] STARTS');
  
  let lastError: Error | undefined;
  const startTime = Date.now();
  const queryPreview = text.substring(0, 100).replace(/\s+/g, ' ').trim();

  logDebug(context, '[databasePool.ts][query] Executing database query', {
    queryPreview,
    hasValues: !!values,
    valueCount: values?.length || 0,
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const pool = await getPoolAsync();
      const res = await pool.query<T>(text, values);
      const duration = Date.now() - startTime;

      logDebug(context, '[databasePool.ts][query] Query executed successfully', {
        queryPreview,
        duration,
        rowCount: res.rowCount,
        attempt,
      });

      if (duration > DATABASE_CONSTANTS.SLOW_QUERY_THRESHOLD_MS) {
        logWarn(context, '[databasePool.ts][query] Slow query detected', {
          queryPreview,
          duration,
          rowCount: res.rowCount,
        });
      }

      logDebug(context, '[databasePool.ts][query] ENDS');
      return res;
    } catch (err) {
      lastError = err as Error;

      if (lastError.message.includes('syntax error')) {
        logError(context, '[databasePool.ts][query] Query syntax error', lastError, { 
          queryPreview,
        });
        logError(context, '[databasePool.ts][query] ENDS with error');
        throw lastError;
      }

      if (attempt < retries) {
        const delay = Math.min(
          DATABASE_CONSTANTS.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1),
          DATABASE_CONSTANTS.MAX_RETRY_DELAY_MS
        );
        logWarn(context, '[databasePool.ts][query] Query failed, retrying', {
          attempt,
          maxRetries: retries,
          delay,
          errorCode: (lastError as any).code,
          errorMessage: lastError.message,
          queryPreview,
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  logError(context, '[databasePool.ts][query] Query failed after all retries', lastError, {
    queryPreview,
    retries,
  });
  logError(context, '[databasePool.ts][query] ENDS with error');
  throw lastError;
}

export async function testConnection(): Promise<void> {
  logInfo(context, '[databasePool.ts][testConnection] STARTS');
  logInfo(context, '[databasePool.ts][testConnection] Testing database connectivity...');
  
  try {
    const startTime = Date.now();
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    const duration = Date.now() - startTime;
    
    if (result.rows.length > 0) {
      logInfo(context, '[databasePool.ts][testConnection] Database connection test SUCCESSFUL', {
        currentTime: result.rows[0].current_time,
        postgresVersion: result.rows[0].pg_version?.split(' ').slice(0, 2).join(' '),
        responseTime: `${duration}ms`,
      });
    }
    
    logInfo(context, '[databasePool.ts][testConnection] ENDS');
  } catch (error) {
    logError(context, '[databasePool.ts][testConnection] Database connection test FAILED', error as Error);
    logError(context, '[databasePool.ts][testConnection] ENDS with error');
    throw new Error(`Database connection test failed: ${(error as Error).message}`);
  }
}

export async function closePool(): Promise<void> {
  logInfo(context, '[databasePool.ts][closePool] STARTS');
  
  logInfo(context, '[databasePool.ts][closePool] Closing database connection pool');
  await poolManager.closePool();
  logInfo(context, '[databasePool.ts][closePool] Database connection pool closed');
  
  logInfo(context, '[databasePool.ts][closePool] ENDS');
}
