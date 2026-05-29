# Virus Scan Integration - Complete Architecture & Code Flow

## Overview

This document explains the complete virus scanning workflow, architecture, and how to test both locally and in production.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Code Flow](#code-flow)
4. [Dual S3 Configuration](#dual-s3-configuration)
5. [Local Testing](#local-testing)
6. [Production Setup](#production-setup)
7. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Components

```
┌─────────────────┐
│   Backend API   │  - Uploads files to AWS S3
│                 │  - Creates entries in uploaded_files table
│                 │  - Sends SQS messages (optional)
└────────┬────────┘
         │
         ├───────► AWS S3 (Real)
         │         └─ s3-eip-dev-storage
         │
         └───────► PostgreSQL
                   └─ uploaded_files table
                   
                   
         SQS Message (event-driven)
                   │
                   ▼
         ┌─────────────────┐
         │  Scan Worker    │  - Polls SQS queue
         │  (ECS Task)     │  - Reads uploaded_files table
         │                 │  - Downloads from source S3
         │                 │  - Scans with ClamAV
         └────────┬────────┘  - Moves to clean/quarantine S3
                  │           - Updates scan_events table
                  │
                  ├───────► S3 (Clean)
                  │         └─ uploads-clean (ministack/AWS)
                  │
                  ├───────► S3 (Quarantine)
                  │         └─ uploads-quarantine (ministack/AWS)
                  │
                  └───────► PostgreSQL
                            └─ file_scan_events table
```

### Workflow Types

#### 1. Event-Driven (S3 → SQS → Worker)
- S3 upload triggers event notification
- Event sent to SQS queue
- Worker polls queue and processes

#### 2. Database-Driven (DB Poll → Worker)
- Worker polls `uploaded_files` table for unscanned files
- Worker processes files and updates status

#### 3. Hybrid (Backend → SQS → Worker)
- Backend uploads file and creates DB entry
- Backend sends SQS message with fileId
- Worker processes message and updates DB
- **This is the recommended approach**

---

## Database Schema

### uploaded_files Table

Stores metadata about all uploaded files.

```sql
CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider TEXT NOT NULL,           -- 'aws_s3' or 'ministack_s3'
  s3_key TEXT,                               -- Full S3 key path
  bucket_name TEXT,                          -- Source bucket name
  virtual_folder TEXT,                       -- Folder path
  filename TEXT NOT NULL,                    -- Just the filename
  file_content_type TEXT NOT NULL,           -- MIME type
  file_size_bytes BIGINT NOT NULL,           -- File size
  uploaded_at_timestamp TIMESTAMPTZ NOT NULL -- Upload timestamp
);
```

**Example Row:**
```
id: 4bdcf303-d32d-4653-a4d5-e2c75e28398b
storage_provider: aws_s3
s3_key: aad06155-de19-4036-98c9-0a29e3404108/PLAN_INFO/{B20FE74D-27A6-4E30-BE10-486CED7FC7E1}.png
bucket_name: s3-eip-dev-storage
virtual_folder: aad06155-de19-4036-98c9-0a29e3404108/PLAN_INFO
filename: {B20FE74D-27A6-4E30-BE10-486CED7FC7E1}.png
file_content_type: image/png
file_size_bytes: 63110
uploaded_at_timestamp: 2026-05-08 17:21:22.413+01
```

### file_scan_events Table

Tracks virus scan events and results.

```sql
CREATE TABLE file_scan_events (
  event_id UUID PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES uploaded_files(id),
  scan_status TEXT NOT NULL,                 -- 'pending', 'scanning', 'completed', 'failed'
  scan_result TEXT,                          -- 'clean', 'infected', NULL if failed
  scan_started_at TIMESTAMPTZ,
  scan_completed_at TIMESTAMPTZ,
  error_message TEXT,
  clamav_version TEXT,
  virus_name TEXT,                           -- If infected, name of virus
  moved_to_bucket TEXT,                      -- Destination bucket
  moved_to_s3_key TEXT                       -- Destination S3 key
);
```

---

## Code Flow

### Complete End-to-End Flow

#### Step 1: File Upload (Backend)

**File:** `desnz-syeia-backend-beta/src/services/FileUploadService.ts`

```typescript
// 1. Backend receives file upload request
// 2. Upload file to AWS S3 (s3-eip-dev-storage)
const uploadResult = await s3Client.upload({
  Bucket: 's3-eip-dev-storage',
  Key: s3Key,
  Body: fileBuffer,
  ContentType: mimeType
});

// 3. Insert metadata into uploaded_files table
const fileId = uuidv4();
await db.query(`
  INSERT INTO uploaded_files 
  (id, storage_provider, s3_key, bucket_name, virtual_folder, filename, file_content_type, file_size_bytes, uploaded_at_timestamp)
  VALUES ($1, 'aws_s3', $2, 's3-eip-dev-storage', $3, $4, $5, $6, NOW())
`, [fileId, s3Key, virtualFolder, filename, mimeType, fileSize]);

// 4. Send SQS message to trigger scan
await sqsClient.sendMessage({
  QueueUrl: scanQueueUrl,
  MessageBody: JSON.stringify({
    eventId: uuidv4(),
    fileId: fileId
  })
});
```

#### Step 2: Message Processing (Scan Worker)

**File:** `desnz-syeia-payment-service/src/worker/worker.ts`

```typescript
// 1. Poll SQS queue for messages
const messages = await sqs.receiveMessage({
  QueueUrl: scanQueueUrl,
  MaxNumberOfMessages: 10,
  WaitTimeSeconds: 20  // Long polling
});

// 2. For each message, process the scan
for (const message of messages.Messages) {
  await processScanMessage(message);
}
```

#### Step 3: Scan Processing (Use Case)

**File:** `desnz-syeia-payment-service/src/use-cases/ProcessFileScanUseCase.ts`

```typescript
async execute(fileId: string, eventId: string) {
  // 1. Create scan event in database
  await fileScanEventRepository.create({
    event_id: eventId,
    file_id: fileId,
    scan_status: 'pending'
  });
  
  // 2. Get file metadata from uploaded_files table
  const fileMetadata = await uploadedFileRepository.findById(fileId);
  
  if (!fileMetadata) {
    throw new Error(`File ${fileId} not found in uploaded_files table`);
  }
  
  // 3. Determine source S3 configuration
  const sourceS3Config = {
    endpoint: fileMetadata.storage_provider === 'aws_s3' 
      ? undefined  // Use real AWS
      : 'http://ministack:4566',  // Use ministack
    bucket: fileMetadata.bucket_name,
    key: fileMetadata.s3_key
  };
  
  // 4. Download file from source S3
  logger.info(`Downloading file from ${sourceS3Config.bucket}/${sourceS3Config.key}`);
  
  const fileStream = await s3Service.downloadFile(
    sourceS3Config.bucket,
    sourceS3Config.key,
    sourceS3Config.endpoint
  );
  
  // 5. Update scan status to 'scanning'
  await fileScanEventRepository.update(eventId, {
    scan_status: 'scanning',
    scan_started_at: new Date()
  });
  
  // 6. Scan file with ClamAV
  logger.info(`Scanning file ${fileId} with ClamAV`);
  
  const scanResult = await clamAVClient.scanStream(fileStream);
  
  // 7. Determine destination bucket
  const destinationBucket = scanResult.isClean 
    ? 'uploads-clean' 
    : 'uploads-quarantine';
  
  const destinationKey = `${fileMetadata.virtual_folder}/${fileMetadata.filename}`;
  
  // 8. Move file to destination bucket (ministack for local, AWS for prod)
  logger.info(`Moving file to ${destinationBucket}/${destinationKey}`);
  
  await s3Service.copyFile(
    sourceS3Config.bucket,
    sourceS3Config.key,
    destinationBucket,
    destinationKey,
    process.env.DESTINATION_S3_ENDPOINT  // ministack for local testing
  );
  
  // 9. Update scan event with results
  await fileScanEventRepository.update(eventId, {
    scan_status: 'completed',
    scan_result: scanResult.isClean ? 'clean' : 'infected',
    scan_completed_at: new Date(),
    virus_name: scanResult.virusName,
    moved_to_bucket: destinationBucket,
    moved_to_s3_key: destinationKey
  });
  
  // 10. Delete message from SQS queue
  await sqs.deleteMessage({
    QueueUrl: scanQueueUrl,
    ReceiptHandle: message.ReceiptHandle
  });
  
  logger.info(`Scan completed for file ${fileId}: ${scanResult.isClean ? 'CLEAN' : 'INFECTED'}`);
}
```

#### Step 4: S3 Service (Dual Endpoint Support)

**File:** `desnz-syeia-payment-service/src/services/S3Service.ts`

```typescript
class S3Service {
  private realAwsClient: S3Client;
  private ministackClient: S3Client;
  
  constructor() {
    // Real AWS S3 client (for source files)
    this.realAwsClient = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    // Ministack client (for destination files in local testing)
    this.ministackClient = new S3Client({
      region: 'eu-west-2',
      endpoint: 'http://ministack:4566',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    });
  }
  
  async downloadFile(bucket: string, key: string, endpoint?: string) {
    const client = endpoint ? this.ministackClient : this.realAwsClient;
    
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const response = await client.send(command);
    return response.Body;
  }
  
  async uploadFile(bucket: string, key: string, body: Buffer, endpoint?: string) {
    const client = endpoint ? this.ministackClient : this.realAwsClient;
    
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body
    });
    
    await client.send(command);
  }
}
```

---

## Dual S3 Configuration

### Why Dual Configuration?

- **Source files**: Real AWS S3 (production data)
- **Destination files**: Ministack (local testing) or AWS S3 (production)

This allows you to test the full workflow locally without affecting production data.

### Environment Variables

**Local Development (docker-compose.yml):**

```yaml
scan-worker-ecs:
  environment:
    # Source S3 (Real AWS)
    AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
    AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
    AWS_REGION: eu-west-2
    
    # Destination S3 (Ministack for local testing)
    DESTINATION_S3_ENDPOINT: http://ministack:4566
    DESTINATION_S3_ACCESS_KEY_ID: test
    DESTINATION_S3_SECRET_ACCESS_KEY: test
    DESTINATION_S3_REGION: eu-west-2
    
    # Bucket names
    CLEAN_BUCKET: uploads-clean
    QUARANTINE_BUCKET: uploads-quarantine
    
    # Database
    DB_HOST: postgres
    DB_PORT: 5432
    DB_NAME: appdb
    DB_USER: postgres
    DB_PASSWORD: postgres
    
    # SQS
    SQS_ENDPOINT: http://ministack:4566
    SQS_QUEUE_URL: http://ministack:4566/000000000000/scan-queue
```

**Production (AWS ECS Task Definition):**

```json
{
  "environment": [
    {
      "name": "AWS_REGION",
      "value": "eu-west-2"
    },
    {
      "name": "CLEAN_BUCKET",
      "value": "prod-uploads-clean"
    },
    {
      "name": "QUARANTINE_BUCKET",
      "value": "prod-uploads-quarantine"
    },
    {
      "name": "DB_HOST",
      "value": "prod-rds-endpoint.amazonaws.com"
    },
    {
      "name": "SQS_QUEUE_URL",
      "value": "https://sqs.eu-west-2.amazonaws.com/123456789/prod-scan-queue"
    }
  ]
}
```

Note: In production, no `DESTINATION_S3_ENDPOINT` is needed - it will use real AWS S3 by default.

---

## Local Testing

### Prerequisites

1. Docker Desktop running
2. All containers running: `docker compose up -d`
3. AWS CLI installed
4. PostgreSQL client (psql) or DBeaver for database access

### Test Scenario 1: Simulated File (Fully Local)

Use this when you want to test without accessing real AWS S3.

```powershell
# Navigate to local-dev-environment folder
cd DESNZ-SYEIA-Lambdas\local-dev-environment

# Run test with clean file
.\test-local-scan.ps1

# Run test with infected file (EICAR test string)
.\test-local-scan.ps1 -CreateInfected
```

**What this does:**
1. Creates a test file locally
2. Uploads it to ministack S3 (test-source-bucket)
3. Inserts entry in `uploaded_files` table
4. Sends SQS message
5. Worker scans and moves to clean/quarantine bucket
6. Verifies results

### Test Scenario 2: Real AWS S3 File

Use this when you have a real file in AWS S3 that you want to scan.

```powershell
# Test with real AWS S3 file
.\test-db-driven-scan.ps1 `
  -S3Key "aad06155-de19-4036-98c9-0a29e3404108/PLAN_INFO/{B20FE74D-27A6-4E30-BE10-486CED7FC7E1}.png" `
  -BucketName "s3-eip-dev-storage" `
  -FileName "{B20FE74D-27A6-4E30-BE10-486CED7FC7E1}.png" `
  -ContentType "image/png" `
  -FileSize 63110
```

**What this does:**
1. Inserts entry in `uploaded_files` table pointing to real AWS S3 file
2. Sends SQS message
3. Worker downloads from real AWS S3
4. Worker scans file
5. Worker moves to ministack clean/quarantine bucket (for local testing)
6. Verifies results

### Manual Testing

If you want to manually test each step:

```powershell
# 1. Insert test entry into database
docker compose exec -T postgres psql -U postgres -d appdb -c "
INSERT INTO uploaded_files (id, storage_provider, s3_key, bucket_name, virtual_folder, filename, file_content_type, file_size_bytes, uploaded_at_timestamp)
VALUES ('YOUR-FILE-ID', 'aws_s3', 'YOUR-S3-KEY', 'YOUR-BUCKET', 'YOUR-FOLDER', 'YOUR-FILENAME', 'image/png', 12345, NOW());
"

# 2. Send SQS message
aws --endpoint-url=http://localhost:4566 sqs send-message `
  --queue-url http://localhost:4566/000000000000/scan-queue `
  --message-body '{\"eventId\":\"YOUR-EVENT-ID\",\"fileId\":\"YOUR-FILE-ID\"}'

# 3. Check scan worker logs
docker compose logs -f scan-worker-ecs

# 4. Check scan results in database
docker compose exec -T postgres psql -U postgres -d appdb -c "
SELECT * FROM file_scan_events WHERE file_id = 'YOUR-FILE-ID';
"

# 5. Check destination bucket
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-clean/ --recursive
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-quarantine/ --recursive
```

---

## Production Setup

### Step 1: Create AWS Resources

```bash
# Create clean bucket
aws s3 mb s3://prod-uploads-clean --region eu-west-2

# Create quarantine bucket
aws s3 mb s3://prod-uploads-quarantine --region eu-west-2

# Create SQS queue
aws sqs create-queue --queue-name prod-scan-queue --region eu-west-2

# Create dead-letter queue
aws sqs create-queue --queue-name prod-scan-queue-dlq --region eu-west-2
```

### Step 2: Configure IAM Permissions

Create IAM role for ECS task with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::s3-eip-dev-storage/*",
        "arn:aws:s3:::prod-uploads-clean/*",
        "arn:aws:s3:::prod-uploads-quarantine/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:eu-west-2:*:prod-scan-queue"
    },
    {
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 3: Deploy ECS Task

Update ECS task definition with production environment variables (see Dual S3 Configuration section above).

### Step 4: Update Backend

Ensure backend sends SQS messages after file upload:

```typescript
// In FileUploadService.ts
await sqsClient.sendMessage({
  QueueUrl: process.env.SQS_QUEUE_URL,
  MessageBody: JSON.stringify({
    eventId: uuidv4(),
    fileId: fileId
  })
});
```

---

## Troubleshooting

### Issue: Worker not processing messages

**Check:**
1. SQS queue has messages: `aws --endpoint-url=http://localhost:4566 sqs receive-message --queue-url http://localhost:4566/000000000000/scan-queue`
2. Worker is running: `docker compose ps scan-worker-ecs`
3. Worker logs: `docker compose logs scan-worker-ecs`

**Solution:**
- Restart worker: `docker compose restart scan-worker-ecs`
- Purge queue and resend: `aws --endpoint-url=http://localhost:4566 sqs purge-queue --queue-url http://localhost:4566/000000000000/scan-queue`

### Issue: File not found in S3

**Check:**
1. File exists in source bucket
2. S3 key is correct in `uploaded_files` table
3. Worker has correct AWS credentials

**Solution:**
- Verify S3 key: `aws s3 ls s3://YOUR-BUCKET/YOUR-KEY`
- Check credentials in docker-compose.yml

### Issue: Scan worker can't connect to database

**Check:**
1. Database connection string
2. Database is running: `docker compose ps postgres`
3. Database credentials

**Solution:**
- Verify connection: `docker compose exec -T postgres psql -U postgres -d appdb -c "SELECT 1;"`
- Check DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in worker environment

### Issue: Files not moving to clean/quarantine bucket

**Check:**
1. Destination buckets exist
2. Worker has permissions to write to destination S3
3. ClamAV scan completed successfully

**Solution:**
- Create buckets: `aws --endpoint-url=http://localhost:4566 s3 mb s3://uploads-clean`
- Check worker logs for errors

---

## Best Practices

1. **Always use SQS for triggering scans** - provides retry logic and DLQ
2. **Store all file metadata in `uploaded_files` table** - single source of truth
3. **Log every step** - makes debugging much easier
4. **Use event IDs** - allows tracking specific scan operations
5. **Implement health checks** - ensure worker is running and processing
6. **Monitor queue depth** - alert if queue is backing up
7. **Set up CloudWatch alarms** - for failed scans, queue depth, worker errors
8. **Use S3 lifecycle policies** - automatically delete old files from quarantine
9. **Implement retry logic** - with exponential backoff for transient errors
10. **Test with EICAR file** - safe way to test infected file handling

---

## Monitoring & Observability

### Key Metrics

1. **Queue Metrics:**
   - Messages in queue
   - Messages in DLQ
   - Age of oldest message

2. **Scan Metrics:**
   - Scans completed per minute
   - Average scan duration
   - Clean vs infected ratio
   - Failed scans

3. **Worker Metrics:**
   - CPU/memory usage
   - Active tasks
   - Error rate

### CloudWatch Queries

```sql
-- Failed scans in last hour
fields @timestamp, file_id, error_message
| filter scan_status = "failed"
| sort @timestamp desc
| limit 100

-- Average scan duration
stats avg(scan_duration_ms) as avg_duration by bin(5m)

-- Infected files
fields @timestamp, file_id, virus_name
| filter scan_result = "infected"
| sort @timestamp desc
```

---

## FAQ

**Q: Can I use this with Azure Blob Storage or Google Cloud Storage?**
A: Yes, but you'll need to implement adapters for those services in S3Service.ts.

**Q: How do I scan files that are already in the database?**
A: Create a script that reads `uploaded_files` table and sends SQS messages for each unscanned file.

**Q: What happens if ClamAV is down?**
A: The message will be retried (up to 3 times based on DLQ policy), then moved to DLQ for manual investigation.

**Q: Can I scan files larger than 5GB?**
A: Yes, but you may need to increase Lambda timeout or use ECS with more memory. ClamAV can scan very large files.

**Q: How do I update ClamAV virus definitions?**
A: Run `freshclam` in the container or restart the container to pull latest definitions.

---

## Summary

This virus scanning system provides:
- ✅ Database-driven file tracking
- ✅ Event-driven scan triggering
- ✅ Dual S3 support (real AWS + ministack)
- ✅ Local testing capability
- ✅ Production-ready architecture
- ✅ Comprehensive logging
- ✅ Retry and DLQ support
- ✅ Clean/quarantine file management

For questions or issues, check the troubleshooting section or review the worker logs.
