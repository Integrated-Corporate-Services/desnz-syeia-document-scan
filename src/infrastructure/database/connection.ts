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
    // Support both DB_* and PG* variable names (DB_* preferred for ECS)
    const host = process.env.DB_HOST ?? process.env.PGHOST;
    const port = parseInt(process.env.DB_PORT ?? process.env.PGPORT ?? '5432');
    const database = process.env.DB_NAME ?? process.env.PGDATABASE;
    const sslMode = process.env.DB_SSLMODE ?? process.env.PGSSLMODE ?? 'require';
    
    // Try to get credentials from DB_CREDENTIALS secret (JSON format)
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
    
    // Fallback to individual environment variables if DB_CREDENTIALS not available
    if (!user) user = process.env.DB_USER ?? process.env.PGUSER;
    if (!password) password = process.env.DB_PASSWORD ?? process.env.PGPASSWORD;
    
    const config: DatabaseConfig = {
      host,
      port,
      database,
      user,
      password,
      ssl: sslMode === 'require' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_SIZE ?? process.env.DB_POOL_MAX ?? '5'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    // Enhanced logging to show exactly what's configured
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

    // Validate required fields
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

/**
 * Test database connectivity by executing a simple query
 * Used during startup to verify RDS connection works
 */
export async function testConnection(): Promise<void> {
  logInfo(context, 'Testing database connectivity...');
  
  try {
    const startTime = Date.now();
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    const duration = Date.now() - startTime;
    
    if (result.rows.length > 0) {
      logInfo(context, 'Database connection test SUCCESSFUL', {
        currentTime: result.rows[0].current_time,
        postgresVersion: result.rows[0].pg_version?.split(' ').slice(0, 2).join(' '), // Truncate long version string
        responseTime: `${duration}ms`,
      });
    }
  } catch (error) {
    logError(context, 'Database connection test FAILED', error as Error);
    throw new Error(`Database connection test failed: ${(error as Error).message}`);
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    logInfo(context, 'Closing database connection pool');
    await pool.end();
    pool = null;
    logInfo(context, 'Database connection pool closed');
  }
}
