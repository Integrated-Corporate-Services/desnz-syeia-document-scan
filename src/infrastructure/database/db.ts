/**
 * Database connection wrapper
 * 
 * Provides initPool and closePool functions as aliases to the core
 * connection module functions. This maintains consistency with other
 * services that use this naming convention.
 */

import { getPool, query } from './connection.js';
import { logInfo, logError } from '../../utils/logger.js';

const context = 'DatabasePool';

/**
 * Initialize the database connection pool
 * This is an alias to getPool() that triggers pool initialization
 */
export async function initPool(): Promise<void> {
  try {
    logInfo(context, 'Initializing database pool...');
    const pool = getPool();
    
    // Test the connection
    await pool.query('SELECT NOW()');
    logInfo(context, 'Database pool initialized and connection verified');
  } catch (error) {
    logError(context, 'Failed to initialize database pool', error);
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
