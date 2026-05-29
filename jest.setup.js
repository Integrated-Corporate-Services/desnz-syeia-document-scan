// Jest setup file - loads environment variables for integration tests
// This ensures tests use the same database configuration as the backend server

// Set NODE_ENV to local to match backend behavior
process.env.NODE_ENV = 'local';

// PostgreSQL SSL configuration - disable for local development
process.env.PGSSLMODE = 'disable';

// Database connection parameters (matching run-backend.ps1)
process.env.PGHOST = 'localhost';
process.env.PGPORT = '5432';
process.env.PGDATABASE = 'postgres';
process.env.PGUSER = 'postgres';
process.env.PGPASSWORD = 'postgres';

// Alternative database environment variables (for compatibility)
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'postgres';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';

// Logging
process.env.LOG_LEVEL = 'error'; // Reduce noise during tests

// Disable login/authentication for integration tests
process.env.LOGIN_DISABLED = 'true';
process.env.SECURITY_ENABLED = 'false';

console.log('✓ Jest setup complete - database configured for local testing');
