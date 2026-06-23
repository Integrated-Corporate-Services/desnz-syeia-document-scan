import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logInfo } from '../utils/logger.js';
import type { S3Config, SqsConfig, ClamavConfig } from '../types/aws.types.js';
import type { DbConfig, DbCredentials, CachedSecret } from '../types/database.types.js';
import { AWS_CONSTANTS } from '../constants/aws.constants.js';
import { DATABASE_CONSTANTS } from '../constants/database.constants.js';
import { WORKER_CONSTANTS } from '../constants/worker.constants.js';

const context = 'Config';

export function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_Region || AWS_CONSTANTS.DEFAULT_REGION;
}

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

export function getDbConfig(): DbConfig {
  return {
    host: process.env.DB_HOST ?? process.env.PGHOST ?? '',
    port: Number(process.env.DB_PORT ?? process.env.PGPORT ?? DATABASE_CONSTANTS.DEFAULT_PORT),
    database: process.env.DB_NAME ?? process.env.PGDATABASE ?? '',
    user: process.env.DB_USER ?? process.env.PGUSER,
    password: process.env.DB_PASSWORD ?? process.env.PGPASSWORD,
    appName: process.env.APP_NAME ?? 'document-scan-worker',
    poolMax: Number(process.env.DB_POOL_MAX ?? process.env.DB_POOL_SIZE ?? DATABASE_CONSTANTS.DEFAULT_POOL_SIZE),
    idleTimeoutMillis: Number(process.env.DB_IDLE_MS ?? DATABASE_CONSTANTS.DEFAULT_IDLE_TIMEOUT_MS),
    connectionTimeoutMillis: Number(process.env.DB_CONN_MS ?? DATABASE_CONSTANTS.DEFAULT_CONNECTION_TIMEOUT_MS),
    queryTimeout: Number(process.env.DB_QUERY_MS ?? 30_000),
  };
}

let _cachedDbSecret: CachedSecret | null = null;
const SECRET_TTL_MS = Number(process.env.DB_SECRET_TTL_MS ?? AWS_CONSTANTS.SECRET_TTL_MS);

function _needRefreshSecret(): boolean {
  if (!_cachedDbSecret) return true;
  return Date.now() - _cachedDbSecret.fetchedAt > SECRET_TTL_MS;
}

export async function getDbSecretConfig(): Promise<DbCredentials> {
  const raw = process.env.DB_CREDENTIALS;
  if (!raw) throw new Error('Missing env var DB_CREDENTIALS (Secrets Manager secret JSON).');

  if (!raw.startsWith('arn:aws:secretsmanager:')) {
    try {
      const parsed = JSON.parse(raw) as DbCredentials;
      if (parsed.username && parsed.password) return parsed;
    } catch {
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

export function getS3Config(): S3Config {
  const uploadsBucket = process.env.S3_UPLOADS_BUCKET ?? process.env.UPLOAD_BUCKET ?? '';
  const cleanBucket = process.env.S3_CLEAN_BUCKET ?? process.env.CLEAN_BUCKET ?? '';
  const quarantineBucket = process.env.S3_QUARANTINE_BUCKET ?? process.env.QUARANTINE_BUCKET ?? '';
  
  logInfo(context, 'S3Config resolved', {
    uploadsBucket: uploadsBucket || '(NOT SET)',
    cleanBucket: cleanBucket || '(NOT SET)',
    quarantineBucket: quarantineBucket || '(NOT SET)',
    region: getAwsRegion(),
    hasCustomEndpoint: !!(process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT),
  });
  
  return {
    region: getAwsRegion(),
    uploadsBucket,
    cleanBucket,
    quarantineBucket,
    endpoint: process.env.S3_ENDPOINT ?? process.env.AWS_ENDPOINT,
  };
}

export function getSqsConfig(): SqsConfig {
  const queueUrl = process.env.SQS_SCAN_QUEUE_URL ?? process.env.SQS_QUEUE_URL ?? '';
  
  logInfo(context, 'SQSConfig resolved', {
    queueUrl: queueUrl || '(NOT SET)',
    region: getAwsRegion(),
    pollWaitSeconds: Number(process.env.SQS_POLL_WAIT_SECONDS ?? 10),
    visibilityTimeout: Number(process.env.SQS_VISIBILITY_TIMEOUT ?? 300),
    hasCustomEndpoint: !!process.env.AWS_ENDPOINT,
  });
  
  return {
    region: getAwsRegion(),
    queueUrl,
    pollWaitSeconds: Number(process.env.SQS_POLL_WAIT_SECONDS ?? WORKER_CONSTANTS.SQS_WAIT_TIME_SECONDS),
    visibilityTimeout: Number(process.env.SQS_VISIBILITY_TIMEOUT ?? WORKER_CONSTANTS.SQS_EXTENDED_VISIBILITY_TIMEOUT_SECONDS),
    endpoint: process.env.AWS_ENDPOINT,
  };
}

export function getClamavConfig(): ClamavConfig {
  return {
    host: process.env.CLAMAV_HOST ?? AWS_CONSTANTS.CLAMAV_DEFAULT_HOST,
    port: Number(process.env.CLAMAV_PORT ?? AWS_CONSTANTS.CLAMAV_DEFAULT_PORT),
    simulateScan: process.env.SIMULATE_SCAN === 'true',
  };
}