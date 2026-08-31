/**
 * Database Pool Manager with On-Demand Password Rotation
 * 
 * Supports two credential modes:
 * 1. DB_CREDENTIALS (ECS valueFrom) - Recommended for production
 *    - Initial credentials loaded from DB_CREDENTIALS (JSON injected by ECS)
 *    - On authentication failure, fetches fresh credentials from DB_CREDENTIALS_SECRET_ARN
 *    - No ECS restart required for password rotation
 * 
 * 2. Environment Variables - Fallback mode
 *    - Uses DB_HOST, DB_USER, DB_PASSWORD directly
 *    - No automatic password rotation support
 *    - Requires container restart for password changes
 * 
 * Environment Variables:
 * - DB_CREDENTIALS: JSON credentials injected by ECS (optional, recommended for rotation)
 * - DB_CREDENTIALS_SECRET_ARN: Secrets Manager ARN for fetching rotated passwords (required for rotation)
 * - DB_HOST, DB_PORT, DB_NAME: Database connection details
 */

import { Pool, PoolConfig } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getDbConfig } from './config.js';
import { logInfo, logError, logWarn, logDebug } from '../utils/logger.js';
import type { DbCredentials } from '../types/database.types.js';

const context = 'DBPoolManager';

const isLocal = (process.env.NODE_ENV || '').toLowerCase() === 'local';
const sslMode = (process.env.DB_SSLMODE || 'require').toLowerCase();

class DatabasePoolManager {
  private currentPool: Pool | null = null;
  private currentCredentials: DbCredentials | null = null;
  private isRefreshing = false;
  private isWrapped = false; // Track if pool has been wrapped to prevent re-wrapping

  /**
   * Build SSL configuration for AWS RDS
   * RDS uses AWS-managed certificates which may not be in default trust store
   * Set rejectUnauthorized: false to allow connections without cert validation
   */
  private buildSslConfig(): boolean | { require: boolean; rejectUnauthorized: boolean } {
    if (isLocal || sslMode === 'disable') return false;
    
    return {
      require: true,
      rejectUnauthorized: false,
    };
  }

  /**
   * Check if error is an authentication failure
   */
  private isAuthenticationError(error: unknown): boolean {
    if (error instanceof Error) {
      const pgError = error as Error & { code?: string };
      return (
        pgError.code === '28P01' ||
        pgError.message?.toLowerCase().includes('password authentication failed')
      );
    }
    return false;
  }

  /**
   * Get current pool instance (creates if needed)
   * Returns the pool (wrapped only once during initialization)
   */
  async getPool(): Promise<Pool> {
    if (!this.currentPool) {
      await this.initializePool();
    }
    if (!this.currentPool) {
      throw new Error('Failed to initialize database pool');
    }
    
    // Return unwrapped pool reference - wrapping happens once in initializePool
    return this.currentPool;
  }

  /**
   * Wrap pool to detect authentication failures and trigger automatic refresh with retry
   */
  private wrapPoolWithAutoRefresh(pool: Pool): Pool {
    const originalQuery = pool.query.bind(pool);
    const originalConnect = pool.connect.bind(pool);

    // Wrap query method
    (pool as any).query = async (...args: any[]): Promise<any> => {
      try {
        return await (originalQuery as any)(...args);
      } catch (error) {
        if (this.isAuthenticationError(error)) {
          logWarn(context, '[query] Authentication error detected during query - attempting credential refresh');
          
          // Check if refresh is available
          const hasSecretArn = 
            process.env.DB_CREDENTIALS_SECRET_ARN || 
            process.env.DB_CREDENTIALS?.startsWith('arn:aws:secretsmanager:');
          
          if (hasSecretArn && !this.isRefreshing) {
            try {
              await this.refreshCredentials();
              logInfo(context, '[query] Retrying query after credential refresh');
              // Retry once with refreshed pool
              if (this.currentPool) {
                return await (this.currentPool.query as any)(...args);
              }
            } catch (refreshError) {
              logError(context, '[query] Credential refresh failed', refreshError as Error);
            }
          }
        }
        throw error;
      }
    };

    // Wrap connect method
    (pool as any).connect = async (...args: any[]): Promise<any> => {
      try {
        return await (originalConnect as any)(...args);
      } catch (error) {
        if (this.isAuthenticationError(error)) {
          logWarn(context, '[connect] Authentication error detected during connect - attempting credential refresh');
          
          const hasSecretArn = 
            process.env.DB_CREDENTIALS_SECRET_ARN || 
            process.env.DB_CREDENTIALS?.startsWith('arn:aws:secretsmanager:');
          
          if (hasSecretArn && !this.isRefreshing) {
            try {
              await this.refreshCredentials();
              logInfo(context, '[connect] Retrying connect after credential refresh');
              // Retry once with refreshed pool
              if (this.currentPool) {
                return await (this.currentPool.connect as any)(...args);
              }
            } catch (refreshError) {
              logError(context, '[connect] Credential refresh failed', refreshError as Error);
            }
          }
        }
        throw error;
      }
    };

    return pool;
  }

  /**
   * Initialize database pool with credentials
   */
  private async initializePool(): Promise<void> {
    logInfo(context, '[initializePool] Initializing database connection pool');

    const credentials = await this.loadInitialCredentials();
    this.currentCredentials = credentials;

    const poolConfig = this.createPoolConfig(credentials);
    this.currentPool = new Pool(poolConfig);

    // Wrap pool only once during initialization
    if (!this.isWrapped) {
      this.currentPool = this.wrapPoolWithAutoRefresh(this.currentPool);
      this.isWrapped = true;
      logDebug(context, '[initializePool] Pool wrapped with auto-refresh capability');
    }

    this.setupEventHandlers();

    logInfo(context, '[initializePool] Database pool initialized successfully', {
      host: poolConfig.host,
      database: poolConfig.database,
      credentialSource: process.env.DB_CREDENTIALS ? 'DB_CREDENTIALS' : 'environment',
      rotationEnabled: !!process.env.DB_CREDENTIALS_SECRET_ARN
    });
  }

  /**
   * Load initial credentials from DB_CREDENTIALS or environment
   */
  private async loadInitialCredentials(): Promise<DbCredentials> {
    if (process.env.DB_CREDENTIALS) {
      // Check if DB_CREDENTIALS is a Secrets Manager ARN
      if (process.env.DB_CREDENTIALS.startsWith('arn:aws:secretsmanager:')) {
        logInfo(context, '[loadInitialCredentials] DB_CREDENTIALS is an ARN, fetching from Secrets Manager');
        return await this.fetchCredentialsFromSecretsManager(process.env.DB_CREDENTIALS);
      }
      
      // Otherwise treat as JSON
      try {
        const parsed = JSON.parse(process.env.DB_CREDENTIALS);
        if (!parsed.username || !parsed.password) {
          throw new Error('DB_CREDENTIALS must contain username and password');
        }
        logInfo(context, '[loadInitialCredentials] Loaded credentials from DB_CREDENTIALS (JSON)');
        return {
          username: parsed.username,
          password: parsed.password,
          host: parsed.host,
          port: parsed.port,
          dbname: parsed.dbname,
        };
      } catch (error) {
        if (error instanceof SyntaxError) {
          logError(context, '[loadInitialCredentials] DB_CREDENTIALS is not valid JSON or ARN', error as Error);
        }
        throw error;
      }
    }

    // Fallback to environment variables
    logInfo(context, '[loadInitialCredentials] Using credentials from environment variables');
    const dbConfig = getDbConfig();
    if (!dbConfig.user || !dbConfig.password) {
      throw new Error('DB credentials not found in DB_CREDENTIALS or environment (DB_USER, DB_PASSWORD)');
    }
    
    return {
      username: dbConfig.user,
      password: dbConfig.password,
      host: dbConfig.host,
      port: dbConfig.port,
      dbname: dbConfig.database,
    };
  }

  /**
   * Create pool configuration
   */
  private createPoolConfig(credentials: DbCredentials): PoolConfig {
    const dbConfig = getDbConfig();
    
    const dbHost = credentials.host || dbConfig.host;
    const dbPort = credentials.port || dbConfig.port;
    const dbName = credentials.dbname || dbConfig.database;

    if (!dbHost || !dbName) {
      throw new Error('Database host and name are required');
    }

    return {
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: credentials.username,
      password: credentials.password,
      max: dbConfig.poolMax,
      idleTimeoutMillis: dbConfig.idleTimeoutMillis,
      connectionTimeoutMillis: dbConfig.connectionTimeoutMillis,
      ssl: this.buildSslConfig(),
      keepAlive: true,
      application_name: dbConfig.appName || 'document-scan-worker',
    };
  }

  /**
   * Setup pool event handlers
   */
  private setupEventHandlers(): void {
    if (!this.currentPool) return;

    this.currentPool.on('connect', () => {
      logDebug(context, '[setupEventHandlers] New connection established');
    });

    this.currentPool.on('error', (err: Error & { code?: string }) => {
      logError(context, '[setupEventHandlers] Pool error', err);

      // Detect authentication failures (password rotation)
      if (
        err.code === '28P01' ||
        err.message?.toLowerCase().includes('password authentication failed')
      ) {
        logWarn(context, '[setupEventHandlers] Authentication error detected - password may have been rotated');
        
        // Check if we have a Secrets Manager ARN available for refresh
        const hasSecretArn = 
          process.env.DB_CREDENTIALS_SECRET_ARN || 
          process.env.DB_CREDENTIALS?.startsWith('arn:aws:secretsmanager:');
        
        if (hasSecretArn) {
          logInfo(context, '[setupEventHandlers] Triggering automatic credential refresh');
          this.refreshCredentials().catch((refreshErr) => {
            logError(context, '[setupEventHandlers] Failed to refresh credentials', refreshErr as Error);
          });
        } else {
          logWarn(context, '[setupEventHandlers] No Secrets Manager ARN configured - cannot auto-refresh');
          logWarn(context, '[setupEventHandlers] ECS restart required to pick up new password');
        }
      }
    });

    this.currentPool.on('remove', () => {
      logDebug(context, '[setupEventHandlers] Connection removed from pool');
    });
  }

  /**
   * Fetch fresh credentials from Secrets Manager and recreate pool
   */
  async refreshCredentials(): Promise<void> {
    if (this.isRefreshing) {
      logDebug(context, '[refreshCredentials] Credential refresh already in progress');
      return;
    }

    // Check DB_CREDENTIALS_SECRET_ARN first, then fall back to DB_CREDENTIALS if it's an ARN
    let secretArn = process.env.DB_CREDENTIALS_SECRET_ARN;
    if (!secretArn && process.env.DB_CREDENTIALS?.startsWith('arn:aws:secretsmanager:')) {
      secretArn = process.env.DB_CREDENTIALS;
      logInfo(context, '[refreshCredentials] Using DB_CREDENTIALS as secret ARN for refresh');
    }
    
    if (!secretArn) {
      logWarn(context, '[refreshCredentials] Cannot refresh - no Secrets Manager ARN configured');
      return;
    }

    const refreshStartTime = Date.now();
    
    try {
      this.isRefreshing = true;
      logInfo(context, '[refreshCredentials] CREDENTIAL REFRESH STARTED', {
        secretArnConfigured: true,
        timestamp: new Date().toISOString(),
      });

      // Fetch fresh credentials from Secrets Manager
      logInfo(context, '[refreshCredentials] Fetching fresh credentials from Secrets Manager');
      const newCredentials = await this.fetchCredentialsFromSecretsManager(secretArn);

      // Check if credentials actually changed
      const credentialsChanged =
        this.currentCredentials?.username !== newCredentials.username ||
        this.currentCredentials?.password !== newCredentials.password;

      if (credentialsChanged) {
        logInfo(context, '[refreshCredentials] Credentials changed - recreating pool', {
          usernameChanged: this.currentCredentials?.username !== newCredentials.username,
          passwordChanged: this.currentCredentials?.password !== newCredentials.password,
        });

        await this.recreatePool(newCredentials);

        const refreshDuration = Date.now() - refreshStartTime;
        logInfo(context, '[refreshCredentials] CREDENTIAL REFRESH COMPLETED', {
          refreshDurationMs: refreshDuration,
        });
      } else {
        logInfo(context, '[refreshCredentials] Credentials unchanged - pool error may be transient');
      }
    } catch (error) {
      const refreshDuration = Date.now() - refreshStartTime;
      logError(context, '[refreshCredentials] CREDENTIAL REFRESH FAILED', error as Error, {
        refreshDurationMs: refreshDuration,
      });
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Fetch credentials from AWS Secrets Manager
   */
  private async fetchCredentialsFromSecretsManager(secretArn: string): Promise<DbCredentials> {
    const region = process.env.AWS_REGION || process.env.AWS_Region || 'eu-west-2';
    const client = new SecretsManagerClient({ region });

    try {
      logInfo(context, '[fetchCredentialsFromSecretsManager] Calling Secrets Manager', { secretArn });

      const command = new GetSecretValueCommand({ SecretId: secretArn });
      const response = await client.send(command);

      let secretString: string;
      
      // Support both SecretString and SecretBinary
      if (response.SecretString) {
        secretString = response.SecretString;
      } else if (response.SecretBinary) {
        // Decode binary secret to string
        const buffer = Buffer.from(response.SecretBinary);
        secretString = buffer.toString('utf-8');
      } else {
        throw new Error('Secret has neither SecretString nor SecretBinary');
      }

      const parsed = JSON.parse(secretString);
      
      if (!parsed.username || !parsed.password) {
        throw new Error('Secret must contain username and password fields');
      }

      logInfo(context, '[fetchCredentialsFromSecretsManager] Successfully fetched credentials from Secrets Manager', {
        hasUsername: !!parsed.username,
        hasPassword: !!parsed.password,
        hasHost: !!parsed.host,
      });

      return {
        username: parsed.username,
        password: parsed.password,
        host: parsed.host,
        port: parsed.port,
        dbname: parsed.dbname,
      };
    } finally {
      // Clean up client to prevent socket/file descriptor leaks
      client.destroy();
    }
  }

  /**
   * Recreate pool with new credentials
   */
  private async recreatePool(newCredentials: DbCredentials): Promise<void> {
    logInfo(context, '[recreatePool] Recreating connection pool with new credentials');

    // Close existing pool
    if (this.currentPool) {
      logInfo(context, '[recreatePool] Closing old connection pool');
      await this.currentPool.end();
      this.currentPool = null;
      this.isWrapped = false; // Reset wrapping flag for new pool
    }

    // Create new pool
    this.currentCredentials = newCredentials;
    const poolConfig = this.createPoolConfig(newCredentials);
    this.currentPool = new Pool(poolConfig);
    
    // Wrap the new pool
    if (!this.isWrapped) {
      this.currentPool = this.wrapPoolWithAutoRefresh(this.currentPool);
      this.isWrapped = true;
      logDebug(context, '[recreatePool] New pool wrapped with auto-refresh capability');
    }
    
    this.setupEventHandlers();

    logInfo(context, '[recreatePool] New connection pool created successfully');
  }

  /**
   * Close database pool (graceful shutdown)
   */
  async closePool(): Promise<void> {
    if (this.currentPool) {
      logInfo(context, '[closePool] Closing connection pool');
      await this.currentPool.end();
      this.currentPool = null;
      this.isWrapped = false; // Reset wrapping flag to allow re-initialization
      logInfo(context, '[closePool] Connection pool closed');
    }
  }

  /**
   * Execute a query with the pool
   */
  async query<T extends any[] = any[]>(
    queryText: string,
    values?: any[]
  ): Promise<{ rows: T; rowCount: number }> {
    const pool = await this.getPool();
    const result = await pool.query(queryText, values);
    return {
      rows: result.rows as T,
      rowCount: result.rowCount || 0,
    };
  }
}

// Singleton instance
const poolManager = new DatabasePoolManager();

export default poolManager;
