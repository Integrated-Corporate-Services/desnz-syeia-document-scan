import { Pool, QueryResult, QueryResultRow } from 'pg';
import { logDebug, logError, logInfo, logWarn } from '../../utils/logger.js';

let pool: Pool | null = null;
const context = 'DatabaseConnection';

export interface DatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export function getPool(): Pool {
  if (!pool) {
    const config: DatabaseConfig = {
      host: process.env.PGHOST,
      port: parseInt(process.env.PGPORT || '5432'),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_SIZE || '5'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    logInfo(context, 'Initializing database connection pool', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      maxConnections: config.max,
      sslMode: process.env.PGSSLMODE || 'disable',
    });

    pool = new Pool(config);

    pool.on('error', (err: Error) => {
      logError(context, 'Unexpected database pool error', err);
    });

    pool.on('connect', () => {
      logDebug(context, 'New database connection established');
    });

    pool.on('remove', () => {
      logDebug(context, 'Database connection removed from pool');
    });

    logInfo(context, 'Database connection pool initialized successfully');
  }
  return pool;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  values?: any[],
  retries: number = 3
): Promise<QueryResult<T>> {
  let lastError: Error | undefined;
  const startTime = Date.now();
  const queryPreview = text.substring(0, 100).replace(/\s+/g, ' ').trim();

  logDebug(context, 'Executing database query', {
    queryPreview,
    hasValues: !!values,
    valueCount: values?.length || 0,
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await getPool().query<T>(text, values);
      const duration = Date.now() - startTime;

      logDebug(context, 'Query executed successfully', {
        queryPreview,
        duration,
        rowCount: res.rowCount,
        attempt,
      });

      if (duration > 1000) {
        logWarn(context, 'Slow query detected', {
          queryPreview,
          duration,
          rowCount: res.rowCount,
        });
      }

      return res;
    } catch (err) {
      lastError = err as Error;

      if (lastError.message.includes('syntax error')) {
        logError(context, 'Query syntax error', lastError, { 
          queryPreview,
        });
        throw lastError;
      }

      if (attempt < retries) {
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000);
        logWarn(context, 'Query failed, retrying', {
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

  logError(context, 'Query failed after all retries', lastError, {
    queryPreview,
    retries,
  });
  throw lastError;
}

export async function closePool(): Promise<void> {
  if (pool) {
    logInfo(context, 'Closing database connection pool');
    await pool.end();
    pool = null;
    logInfo(context, 'Database connection pool closed');
  }
}
