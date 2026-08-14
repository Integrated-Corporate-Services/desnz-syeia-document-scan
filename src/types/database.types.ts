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

export interface DbCredentials {
  username: string;
  password: string;
  host?: string;
  port?: number;
  dbname?: string;
  engine?: string;
}

export interface CachedSecret {
  value: DbCredentials;
  fetchedAt: number;
}

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user?: string;
  password?: string;
  appName: string;
  poolMax: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  queryTimeout: number;
}
