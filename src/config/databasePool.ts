import { Pool, QueryResult, QueryResultRow } from 'pg';
import { logDebug, logError, logInfo, logWarn } from '../utils/logger.js';
import type { DatabaseConfig } from '../types/database.types.js';
import { DATABASE_CONSTANTS } from '../constants/database.constants.js';

let pool: Pool | null = null;
const context = 'DatabasePool';

export function getPool(): Pool {
  if (!pool) {
    logInfo(context, '[databasePool.ts][getPool] STARTS');
    
    const host = process.env.DB_HOST ?? process.env.PGHOST;
    const port = parseInt(process.env.DB_PORT ?? process.env.PGPORT ?? String(DATABASE_CONSTANTS.DEFAULT_PORT));
    const database = process.env.DB_NAME ?? process.env.PGDATABASE;
    const sslMode = process.env.DB_SSLMODE ?? process.env.PGSSLMODE ?? 'require';
    
    let user: string | undefined;
    let password: string | undefined;
    
    if (process.env.DB_CREDENTIALS) {
      try {
        const credentials = JSON.parse(process.env.DB_CREDENTIALS);
        user = credentials.username;
        password = credentials.password;
      } catch (error) {
        logWarn(context, 'Failed to parse DB_CREDENTIALS JSON, falling back to individual env vars', { error: (error as Error).message });
      }
    }
    
    if (!user) user = process.env.DB_USER ?? process.env.PGUSER;
    if (!password) password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;
    
    const config: DatabaseConfig = {
      host,
      port,
      database,
      user,
      password,
      ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_SIZE ?? process.env.DB_POOL_MAX ?? String(DATABASE_CONSTANTS.DEFAULT_POOL_SIZE)),
      idleTimeoutMillis: DATABASE_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: DATABASE_CONSTANTS.DEFAULT_CONNECTION_TIMEOUT_MS,
    };

    logInfo(context, '=== Database Connection Configuration ===', {
      host: config.host || '(NOT SET - MISSING DB_HOST)',
      port: config.port,
      database: config.database || '(NOT SET - MISSING DB_NAME)',
      user: config.user || '(NOT SET - MISSING DB_USER or DB_CREDENTIALS)',
      hasPassword: !!config.password,
      credentialsSource: process.env.DB_CREDENTIALS ? 'DB_CREDENTIALS (Secrets Manager)' : (process.env.DB_PASSWORD ? 'DB_PASSWORD env var' : '(NOT SET)'),
      sslMode: sslMode,
      sslEnabled: !!config.ssl,
      maxConnections: config.max,
      idleTimeoutMs: config.idleTimeoutMillis,
      connectionTimeoutMs: config.connectionTimeoutMillis,
    });


    if (!config.host || !config.database || !config.user || !config.password) {
      const missing = [];
      if (!config.host) missing.push('DB_HOST');
      if (!config.database) missing.push('DB_NAME');
      if (!config.user) missing.push('DB_USER or DB_CREDENTIALS');
      if (!config.password) missing.push('DB_PASSWORD or DB_CREDENTIALS');
      
      logError(context, `CRITICAL: Missing required database environment variables: ${missing.join(', ')}`, new Error('Database configuration incomplete'));
      logError(context, 'Available environment variables:', {
        DB_HOST: process.env.DB_HOST || '(not set)',
        DB_PORT: process.env.DB_PORT || '(not set)',
        DB_NAME: process.env.DB_NAME || '(not set)',
        DB_USER: process.env.DB_USER || '(not set)',
        DB_PASSWORD: process.env.DB_PASSWORD ? '***SET***' : '(not set)',
        DB_CREDENTIALS: process.env.DB_CREDENTIALS ? '***SET***' : '(not set)',
        DB_SSLMODE: process.env.DB_SSLMODE || '(not set)',
        PGHOST: process.env.PGHOST || '(not set)',
        PGPORT: process.env.PGPORT || '(not set)',
        PGDATABASE: process.env.PGDATABASE || '(not set)',
        PGUSER: process.env.PGUSER || '(not set)',
        PGPASSWORD: process.env.PGPASSWORD ? '***SET***' : '(not set)',
        PGSSLMODE: process.env.PGSSLMODE || '(not set)',
      });
      throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
    }

    logInfo(context, 'Database configuration validated successfully');
    logInfo(context, 'Attempting to initialize PostgreSQL connection pool...');

    pool = new Pool(config);

    pool.on('error', (err: Error) => {
      logError(context, 'Unexpected database pool error', err);
    });

    pool.on('connect', (client) => {
      logInfo(context, 'New database connection established successfully');
      logDebug(context, 'Connection details', {
        processID: (client as any).processID,
        serverVersion: (client as any).serverVersion,
      });
    });

    pool.on('remove', () => {
      logDebug(context, 'Database connection removed from pool');
    });

    pool.on('acquire', () => {
      logDebug(context, 'Client acquired from pool');
    });

    logInfo(context, '[databasePool.ts][getPool] Database connection pool initialized successfully');
    logInfo(context, '[databasePool.ts][getPool] ENDS');
  }
  return pool;
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
      const res = await getPool().query<T>(text, values);
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
  
  if (pool) {
    logInfo(context, '[databasePool.ts][closePool] Closing database connection pool');
    await pool.end();
    pool = null;
    logInfo(context, '[databasePool.ts][closePool] Database connection pool closed');
  }
  
  logInfo(context, '[databasePool.ts][closePool] ENDS');
}
