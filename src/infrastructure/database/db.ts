/**
 * Database connection wrapper
 * 
 * Provides initPool and closePool functions as aliases to the core
 * connection module functions. This maintains consistency with other
 * services that use this naming convention.
 */

import { getPool, query, testConnection } from './connection.js';
import { logInfo, logError } from '../../utils/logger.js';

const context = 'DatabasePool';

/**
 * Initialize the database connection pool
 * This is an alias to getPool() that triggers pool initialization
 * and runs a connectivity test
 */
export async function initPool(): Promise<void> {
  try {
    logInfo(context, 'Initializing database pool...');
    const pool = getPool();
    
    logInfo(context, 'Database pool created successfully');
    
    // Test the connection with enhanced logging
    await testConnection();
    
    logInfo(context, 'Database pool initialized and connection verified successfully');
  } catch (error) {
    logError(context, 'CRITICAL: Failed to initialize database pool', error);
    logError(context, 'Please check:', {
      message: 'Ensure DB_HOST, DB_PORT, DB_NAME, and DB_CREDENTIALS are set correctly',
      rdsEndpoint: process.env.DB_HOST || process.env.PGHOST || '(NOT SET)',
      databaseName: process.env.DB_NAME || process.env.PGDATABASE || '(NOT SET)',
      hasCredentials: !!process.env.DB_CREDENTIALS,
      hasIndividualCreds: !!(process.env.DB_USER && process.env.DB_PASSWORD),
      sslMode: process.env.DB_SSLMODE || process.env.PGSSLMODE || 'require',
    });
    throw error;
  }
}

/**
 * Close the database connection pool
 * Drains all connections and closes the pool
 */
export async function closePool(): Promise<void> {
  try {
    logInfo(context, 'Closing database pool...');
    const pool = getPool();
    await pool.end();
    logInfo(context, 'Database pool closed successfully');
  } catch (error) {
    logError(context, 'Error closing database pool', error);
    throw error;
  }
}

// Re-export other connection utilities
export { getPool, query };
