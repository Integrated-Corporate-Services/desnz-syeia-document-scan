export const CONFIG = {
  DATABASE: {
    HOST: process.env.PGHOST,
    PORT: parseInt(process.env.PGPORT || '5432'),
    DATABASE: process.env.PGDATABASE,
    USER: process.env.PGUSER,
    PASSWORD: process.env.PGPASSWORD,
    SSL_MODE: process.env.PGSSLMODE || 'disable',
    POOL_SIZE: parseInt(process.env.DB_POOL_SIZE || '5'),
  },
  CLAMAV: {
    HOST: process.env.CLAMAV_HOST || 'localhost',
    PORT: parseInt(process.env.CLAMAV_PORT || '3310'),
  },
  AWS: {
    REGION: process.env.AWS_REGION || 'eu-west-2',
  },
} as const;
