import {
  parseScanMessageBody,
  isDirectScanRequest,
  extractS3EventRecord,
} from '../../src/utils/parseScanMessage.js';
import { getS3KeyLookupVariants } from '../../src/utils/s3KeyUtils.js';

const SAMPLE_S3_BODY = JSON.stringify({
  Records: [
    {
      eventSource: 'aws:s3',
      eventName: 'ObjectCreated:Put',
      responseElements: { 'x-amz-request-id': 'ADE8RHBZ4HQEV65R' },
      s3: {
        bucket: { name: 's3-eip-dev-storage' },
        object: {
          key: 'c8ca9336-5a48-4399-93b7-faf81eecbe4f/WORKS/sample-local-pdf.pdf',
        },
      },
    },
  ],
});

describe('parseScanMessage', () => {
  it('parses direct backend message', () => {
    const body = JSON.stringify({
      eventId: '11111111-1111-4111-8111-111111111111',
      fileId: '22222222-2222-4222-8222-222222222222',
    });
    const parsed = parseScanMessageBody(body);
    expect(parsed.source).toBe('direct');
    expect(parsed.eventId).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed.fileId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('parses S3 ObjectCreated message without eventId', () => {
    const parsed = parseScanMessageBody(SAMPLE_S3_BODY);
    expect(parsed.source).toBe('s3Event');
    expect(parsed.eventId).toBeUndefined();
    expect(parsed.fileId).toBe('');
    expect(parsed.keyVariants?.length).toBeGreaterThan(0);
    expect(parsed.keyVariants).toContain(
      'c8ca9336-5a48-4399-93b7-faf81eecbe4f/WORKS/sample-local-pdf.pdf'
    );
  });

  it('decodes plus signs in S3 keys', () => {
    const body = JSON.stringify({
      Records: [
        {
          eventSource: 'aws:s3',
          eventName: 'ObjectCreated:Put',
          s3: {
            object: { key: 'app-id/CAT/Screenshot+2026-05-14+095109.png' },
          },
        },
      ],
    });
    const parsed = parseScanMessageBody(body);
    expect(parsed.keyVariants).toContain('app-id/CAT/Screenshot 2026-05-14 095109.png');
  });

  it('rejects unsupported format', () => {
    expect(() => parseScanMessageBody(JSON.stringify({ foo: 'bar' }))).toThrow(
      /Unsupported message format/
    );
  });
});

describe('getS3KeyLookupVariants', () => {
  it('returns raw and decoded variants', () => {
    const variants = getS3KeyLookupVariants('a/b+c');
    expect(variants).toContain('a/b+c');
    expect(variants).toContain('a/b c');
  });
});

describe('helpers', () => {
  it('detects direct scan request', () => {
    expect(
      isDirectScanRequest({
        eventId: '11111111-1111-4111-8111-111111111111',
        fileId: '22222222-2222-4222-8222-222222222222',
      })
    ).toBe(true);
    expect(isDirectScanRequest({ Records: [] })).toBe(false);
  });

  it('extracts S3 record', () => {
    const record = extractS3EventRecord(JSON.parse(SAMPLE_S3_BODY));
    expect(record?.s3?.object?.key).toContain('sample-local-pdf.pdf');
  });
});
