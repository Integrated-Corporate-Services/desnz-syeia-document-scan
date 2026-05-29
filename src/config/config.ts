/**
 * Configuration module — desnz-syeia-document-scan
 *
 * Pattern (mirrors document-management-service/src/config/config.js):
 *   - Every value is read from an environment variable.
 *   - If the value is an SSM Parameter Store ARN ("arn:aws:ssm:…") the real
 *     value is fetched at runtime using the ECS task role.  This lets the infra
 *     team store secrets in SSM without ever writing them into the task
 *     definition as plain text.
 *   - Database *credentials* (username + password) come from a Secrets Manager
 *     secret whose JSON is injected by ECS as the DB_CREDENTIALS env var.
 *   - Non-secret config (host, port, bucket names, queue URL, region) comes
 *     directly from plain environment variables set in the task definition.
 *
 * Local development:
 *   All values are plain strings in .env.local — no SSM / Secrets Manager
 *   calls are made unless the value actually starts with "arn:aws:ssm:".
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ---------------------------------------------------------------------------
// Region helper
// ---------------------------------------------------------------------------
export function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_Region || 'eu-west-2';
}

// ---------------------------------------------------------------------------
// SSM Parameter Store resolver
//
// If `param` is already a plain string (local dev / non-SSM env var) it is
// returned as-is.  If it starts with "arn:aws:ssm:" the ECS task role is used
// to fetch the decrypted value.
// ---------------------------------------------------------------------------
export async function getConfigValue(
  param: string | undefined,
  region: string = getAwsRegion()
): Promise<string> {
  if (!param) return '';
  if (param.startsWith('arn:aws:ssm:')) {
    const ssm = new SSMClient({ region });
    const command = new GetParameterCommand({ Name: param, WithDecryption: true });
    const response = await ssm.send(command);
    return response.Parameter?.Value ?? '';
  }
  return param;
}

// ---------------------------------------------------------------------------
// Secrets Manager helper
//
// Parses a JSON secret ({"username":"…","password":"…"}).
// In ECS the secret can be pre-injected as the DB_CREDENTIALS env var so this
// function is only called when the value isn't already in the environment.
// ---------------------------------------------------------------------------
export async function getSecretConfig(
  secretArn: string,
  region: string = getAwsRegion()
): Promise<Record<string, string>> {
  if (!secretArn) throw new Error('Missing secret ARN or name.');
  const client = new SecretsManagerClient({ region });
  const cmd = new GetSecretValueCommand({ SecretId: secretArn });
  const res = await client.send(cmd);

  let payload: string;
  if (res.SecretString) {
    payload = res.SecretString;
  } else if (res.SecretBinary) {
    payload = Buffer.from(res.SecretBinary as unknown as string, 'base64').toString('utf8');
  } else {
    throw new Error('Secret has no SecretString or SecretBinary.');
  }

  try {
    return JSON.parse(payload) as Record<string, string>;
  } catch {
    throw new Error('SecretString is not valid JSON.');
  }
}

// ---------------------------------------------------------------------------
// Database config (non-credential values only)
//
// host / port / database name are never secrets — they come from plain env
// vars set in the ECS task definition.
// ---------------------------------------------------------------------------
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  /** Only populated in local dev (DB_USER / DB_PASSWORD plain env vars). */
  user?: string;
  password?: string;
  appName: string;
  poolMax: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  queryTimeout: number;
}

export function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST ?? process.env.PGHOST ?? '',
    port: Number(process.env.DB_PORT ?? process.env.PGPORT ?? 5432),
    database: process.env.DB_NAME ?? process.env.PGDATABASE ?? '',
    user: process.env.DB_USER ?? process.env.PGUSER,
    password: process.env.DB_PASSWORD ?? process.env.PGPASSWORD,
    appName: process.env.APP_NAME ?? 'document-scan-worker',
    poolMax: Number(process.env.DB_POOL_MAX ?? process.env.DB_POOL_SIZE ?? 5),
    idleTimeoutMillis: Number(process.env.DB_IDLE_MS ?? 20_000),
    connectionTimeoutMillis: Number(process.env.DB_CONN_MS ?? 10_000),
    queryTimeout: Number(process.env.DB_QUERY_MS ?? 30_000),
  };
}

// ---------------------------------------------------------------------------
// DB credentials from Secrets Manager
//
// In ECS production: the task definition "secrets" block injects the Secrets
// Manager JSON as DB_CREDENTIALS.  The JSON must be {"username":"…","password":"…"}.
//
// In local dev: DB_CREDENTIALS is not set — getDbConfig() returns plain
// DB_USER / DB_PASSWORD values instead.
// ---------------------------------------------------------------------------
interface DbCredentials {
  username: string;
  password: string;
}

interface CachedSecret {
  value: DbCredentials;
  fetchedAt: number;
}

let _cachedDbSecret: CachedSecret | null = null;
const SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS ?? 10 * 60 * 1000); // 10 min

function _needRefreshSecret(): boolean {
  if (!_cachedDbSecret) return true;
  return Date.now() - _cachedDbSecret.fetchedAt > SECRET_TTL_MS;
}

export async function getDbSecretConfig(): Promise<DbCredentials> {
  const raw = process.env.DB_CREDENTIALS;
  if (!raw) throw new Error('Missing env var DB_CREDENTIALS (Secrets Manager secret JSON).');

  // ECS injects the resolved secret JSON directly — try parsing before hitting
  // Secrets Manager API.
  if (!raw.startsWith('arn:aws:secretsmanager:')) {
    try {
      const parsed = JSON.parse(raw) as DbCredentials;
      if (parsed.username && parsed.password) return parsed;
    } catch {
      // fall through to Secrets Manager fetch
    }
  }

  if (!_needRefreshSecret() && _cachedDbSecret) return _cachedDbSecret.value;

  const parsed = (await getSecretConfig(raw)) as unknown as DbCredentials;
  if (!parsed.username || !parsed.password) {
    throw new Error("DB secret JSON must contain 'username' and 'password'.");
  }
  _cachedDbSecret = { value: parsed, fetchedAt: Date.now() };
  return parsed;
}

// ---------------------------------------------------------------------------
// S3 config
// ---------------------------------------------------------------------------
export interface S3Config {
  region: string;
  uploadsBucket: string;
  cleanBucket: string;
  quarantineBucket: string;
  /** Only set in local dev to point at LocalStack. */
  endpoint?: string;
}

export function getS3Config(): S3Config {
  return {
    region: getAwsRegion(),
    uploadsBucket: process.env.S3_UPLOADS_BUCKET ?? '',
    cleanBucket: process.env.S3_CLEAN_BUCKET ?? '',
    quarantineBucket: process.env.S3_QUARANTINE_BUCKET ?? '',
    endpoint: process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT,
  };
}

// ---------------------------------------------------------------------------
// SQS config
// ---------------------------------------------------------------------------
export interface SqsConfig {
  region: string;
  queueUrl: string;
  pollWaitSeconds: number;
  visibilityTimeout: number;
  /** Only set in local dev to point at LocalStack. */
  endpoint?: string;
}

export function getSqsConfig(): SqsConfig {
  return {
    region: getAwsRegion(),
    queueUrl: process.env.SQS_SCAN_QUEUE_URL ?? '',
    pollWaitSeconds: Number(process.env.SQS_POLL_WAIT_SECONDS ?? 10),
    visibilityTimeout: Number(process.env.SQS_VISIBILITY_TIMEOUT ?? 300),
    endpoint: process.env.AWS_ENDPOINT,
  };
}

// ---------------------------------------------------------------------------
// ClamAV config
//
// In production (ECS): clamd runs as a sidecar container in the same task.
// It binds on localhost:3310 (TCP).  CLAMAV_HOST defaults to localhost and
// CLAMAV_PORT to 3310 — so no env var changes are needed in production.
//
// SIMULATE_SCAN=true bypasses all ClamAV calls (local dev / CI without clamd).
// ---------------------------------------------------------------------------
export interface ClamavConfig {
  host: string;
  port: number;
  simulateScan: boolean;
}

export function getClamavConfig(): ClamavConfig {
  return {
    host: process.env.CLAMAV_HOST ?? 'localhost',
    port: Number(process.env.CLAMAV_PORT ?? 3310),
    simulateScan: process.env.SIMULATE_SCAN === 'true',
  };
}