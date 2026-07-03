import type { ProcessFileScanRequest } from '../types/scan.types.js';
import { deterministicUuid } from './deterministicUuid.js';
import { getS3KeyLookupVariants } from './s3KeyUtils.js';

export type ScanMessageSource = 'direct' | 's3Event';

export interface ParsedScanMessage extends ProcessFileScanRequest {
  source: ScanMessageSource;
  /** Present for S3 events — used to resolve fileId from uploaded_files.s3_key. */
  keyVariants?: string[];
}

interface S3EventRecord {
  eventSource?: string;
  eventName?: string;
  eventTime?: string;
  s3?: {
    bucket?: { name?: string };
    object?: { key?: string };
  };
  responseElements?: {
    'x-amz-request-id'?: string;
  };
}

interface S3EventMessage {
  Records?: S3EventRecord[];
}

interface SnsNotification {
  Type?: string;
  Message?: string;
}

export function unwrapMessagePayload(body: string): unknown {
  let payload: unknown = JSON.parse(body);

  const sns = payload as SnsNotification;
  if (sns?.Type === 'Notification' && typeof sns.Message === 'string') {
    payload = JSON.parse(sns.Message);
  }

  return payload;
}

export function isDirectScanRequest(payload: unknown): payload is ProcessFileScanRequest {
  const candidate = payload as ProcessFileScanRequest;
  return Boolean(candidate?.eventId && candidate?.fileId);
}

export function extractS3EventRecord(payload: unknown): S3EventRecord | null {
  const record = (payload as S3EventMessage).Records?.[0];
  if (!record?.s3?.object?.key) {
    return null;
  }

  if (record.eventSource && record.eventSource !== 'aws:s3') {
    return null;
  }

  if (record.eventName?.startsWith('ObjectRemoved')) {
    return null;
  }

  return record;
}

export function buildS3EventIdSeed(record: S3EventRecord, s3Key: string): string {
  const requestId = record.responseElements?.['x-amz-request-id'];
  if (requestId) {
    return `${requestId}:${s3Key}`;
  }

  const bucket = record.s3?.bucket?.name ?? 'unknown-bucket';
  const eventTime = record.eventTime ?? 'unknown-time';
  return `${bucket}:${s3Key}:${eventTime}`;
}

export function parseDirectScanMessage(payload: unknown): ParsedScanMessage {
  const direct = payload as ProcessFileScanRequest;
  return {
    eventId: direct.eventId,
    fileId: direct.fileId,
    source: 'direct',
  };
}

export function parseS3EventScanMessage(record: S3EventRecord): ParsedScanMessage {
  const rawKey = record.s3!.object!.key!;
  const keyVariants = getS3KeyLookupVariants(rawKey);
  const eventIdSeed = buildS3EventIdSeed(record, keyVariants[0] ?? rawKey);

  return {
    eventId: deterministicUuid(eventIdSeed),
    fileId: '',
    source: 's3Event',
    keyVariants,
  };
}

export function parseScanMessageBody(body: string): ParsedScanMessage {
  const payload = unwrapMessagePayload(body);

  if (isDirectScanRequest(payload)) {
    return parseDirectScanMessage(payload);
  }

  const record = extractS3EventRecord(payload);
  if (!record) {
    throw new Error(
      'Unsupported message format: expected { eventId, fileId } or S3 ObjectCreated event'
    );
  }

  return parseS3EventScanMessage(record);
}
