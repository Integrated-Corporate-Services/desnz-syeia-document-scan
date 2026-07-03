import { createHash } from 'crypto';

/**
 * Builds a deterministic RFC-4122 UUID from arbitrary input.
 * Used for S3 events so retries use the same event_id (idempotency).
 */
export function deterministicUuid(seed: string): string {
  const bytes = createHash('sha256').update(`doc-scan:${seed}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
