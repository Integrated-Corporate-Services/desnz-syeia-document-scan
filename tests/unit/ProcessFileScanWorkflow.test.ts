import { Readable } from 'stream';
import { ProcessFileScanWorkflow } from '../../src/workflows/ProcessFileScanWorkflow';
import { SCAN_STATUS, SCAN_RESULT, EVENT_STATUS } from '../../src/constants/scan.constants';

describe('ProcessFileScanWorkflow segregation', () => {
  const fileId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const s3Key = 'app/PLAN_INFO/sample.pdf';
  const uploadBucket = 's3-eip-dev-storage';
  const cleanBucket = 's3-eip-dev-doc-scan-clean';
  const quarantineBucket = 's3-eip-dev-doc-scan-quarantine';

  const baseFile = {
    id: fileId,
    storage_provider: 'aws_s3',
    s3_key: s3Key,
    bucket_name: uploadBucket,
    virtual_folder: 'app/PLAN_INFO',
    filename: 'sample.pdf',
    file_content_type: 'application/pdf',
    file_size_bytes: 100,
    uploaded_at_timestamp: new Date(),
    scan_status: SCAN_STATUS.PENDING,
    scan_result: null,
    virus_name: null,
    scanned_at: null,
  };

  beforeEach(() => {
    process.env.CLEAN_BUCKET = cleanBucket;
    process.env.QUARANTINE_BUCKET = quarantineBucket;
    process.env.S3_CLEAN_BUCKET = cleanBucket;
    process.env.S3_QUARANTINE_BUCKET = quarantineBucket;
  });

  function createMocks(isClean: boolean) {
    const uploadedFileRepo = {
      findById: jest.fn().mockResolvedValue({ ...baseFile }),
      findByS3Key: jest.fn(),
      updateScanStatus: jest.fn().mockResolvedValue(undefined),
    };
    const fileScanEventRepo = {
      findByEventId: jest.fn().mockResolvedValue(null),
      recordEvent: jest.fn().mockResolvedValue({ eventId }),
      updateEventStatus: jest.fn().mockResolvedValue(undefined),
    };
    const s3Service = {
      getFileStream: jest.fn().mockResolvedValue(Readable.from(['file-bytes'])),
      copyFile: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    const clamAVClient = {
      scanStream: jest.fn().mockResolvedValue({
        isClean,
        virusName: isClean ? null : 'Eicar-Test-Signature',
      }),
    };

    const workflow = new ProcessFileScanWorkflow(
      uploadedFileRepo as any,
      fileScanEventRepo as any,
      s3Service as any,
      clamAVClient as any
    );

    return { workflow, uploadedFileRepo, fileScanEventRepo, s3Service, clamAVClient };
  }

  it('copies CLEAN file to clean bucket, deletes upload original, updates bucket_name', async () => {
    const { workflow, uploadedFileRepo, fileScanEventRepo, s3Service } = createMocks(true);

    await workflow.execute({ fileId, eventId });

    expect(s3Service.copyFile).toHaveBeenCalledWith(
      uploadBucket,
      s3Key,
      cleanBucket,
      s3Key
    );
    expect(s3Service.deleteFile).toHaveBeenCalledWith(uploadBucket, s3Key);
    expect(uploadedFileRepo.updateScanStatus).toHaveBeenLastCalledWith(
      fileId,
      SCAN_STATUS.COMPLETED,
      SCAN_RESULT.CLEAN,
      null,
      expect.any(Date),
      cleanBucket
    );
    expect(fileScanEventRepo.updateEventStatus).toHaveBeenCalledWith(
      eventId,
      EVENT_STATUS.COMPLETED
    );
  });

  it('copies INFECTED file to quarantine, deletes upload original, blocks download bucket to quarantine', async () => {
    const { workflow, uploadedFileRepo, s3Service } = createMocks(false);

    await workflow.execute({ fileId, eventId });

    expect(s3Service.copyFile).toHaveBeenCalledWith(
      uploadBucket,
      s3Key,
      quarantineBucket,
      s3Key
    );
    expect(s3Service.deleteFile).toHaveBeenCalledWith(uploadBucket, s3Key);
    expect(uploadedFileRepo.updateScanStatus).toHaveBeenLastCalledWith(
      fileId,
      SCAN_STATUS.COMPLETED,
      SCAN_RESULT.INFECTED,
      'Eicar-Test-Signature',
      expect.any(Date),
      quarantineBucket
    );
  });
});
