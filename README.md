# Virus Scan Lambda

Production-grade virus scanning pipeline for Node.js + TypeScript application.

**✅ Integrated with existing backend database (`appdb`)**

## Architecture

```
S3 (uploads)
   ↓
SQS (scan-queue)
   ↓
Lambda (worker)
   ↓
ClamAV service
   ↓
S3 (clean / infected)
   ↓
PostgreSQL update (appdb)
   ↓
DLQ (failures)
```

## Features

- Processes already uploaded files in S3
- Uses SQS + Lambda for asynchronous processing
- Scans files using ClamAV (clamd daemon)
- **Shares PostgreSQL database with backend application**
- Updates `uploaded_files` table with scan results
- Segregates files into clean/ and infected/ folders
- Supports idempotent, resilient processing
- Uses DLQ for failure handling

## Project Structure

```
virus-scan/
├── src/
│   ├── application/
│   │   └── usecases/
│   │       └── ProcessFileScanUseCase.ts
│   ├── domain/
│   │   ├── entities/
│   │   │   ├── UploadedFile.ts
│   │   │   ├── FileScanEvent.ts
│   │   │   └── ScanMessage.ts
│   │   ├── constants/
│   │   │   ├── FileScanStatus.ts
│   │   │   ├── ScanResult.ts
│   │   │   ├── S3Folders.ts
│   │   │   └── EventStatus.ts
│   │   └── errors/
│   │       └── index.ts
│   ├── infrastructure/
│   │   ├── database/
│   │   │   └── connection.ts
│   │   ├── repositories/
│   │   │   ├── UploadedFileRepository.ts
│   │   │   └── FileScanEventRepository.ts
│   │   └── external/
│   │       ├── S3Service.ts
│   │       └── ClamAVClient.ts
│   └── config/
│       └── constants.ts
├── migrations/
│   └── 001_add_virus_scan_support.sql
├── docs/
│   ├── SETUP.md
│   └── TESTING.md
├── handler.ts
├── package.json
├── tsconfig.json
└── jest.config.ts
```

## Database Schema

**Note:** The Lambda uses your existing backend database (`appdb`). The following schema changes extend the existing `uploaded_files` table:

### Extended uploaded_files table

```sql
ALTER TABLE public.uploaded_files
ADD COLUMN IF NOT EXISTS scan_status text,
ADD COLUMN IF NOT EXISTS scan_result text,
ADD COLUMN IF NOT EXISTS virus_name text,
ADD COLUMN IF NOT EXISTS scanned_at timestamp with time zone;
```

### New file_scan_events table

```sql
CREATE TABLE IF NOT EXISTS public.file_scan_events(
    event_id uuid PRIMARY KEY,
    file_id uuid NOT NULL,
    s3_key text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);
```

**Migration Status:** ✅ Already applied to `appdb` database

## SQS Message Format

```json
{
  "eventId": "uuid",
  "fileId": "uuid"
}
```

## Processing Rules

### File Processing

1. Read S3 file using bucket_name + s3_key
2. Send stream to ClamAV
3. Receive scan result

### Segregation Logic

| Result   | Destination     |
|----------|----------------|
| CLEAN    | clean/{key}    |
| INFECTED | infected/{key} |

### Database Updates

Update uploaded_files:
- scan_status = COMPLETED
- scan_result = CLEAN | INFECTED
- virus_name = nullable
- scanned_at = now()

### Idempotency

- Check file_scan_events
- If already processed → skip
- Use event_id from SQS message
- Store each processed event

## Failure Handling

- Throw error → message retried
- After max retries → sent to DLQ
- Do NOT partially update DB on failure

## Quick Start

**Prerequisites:**
- Your backend database (`appdb`) running on localhost:5432
- ClamAV running on localhost:3310 (use Docker Compose in `../local-dev-environment`)

**Run the Lambda test:**
```powershell
cd C:\Users\ChoudhariSushant(ICS\Desktop\fontend\DESNZ-SYEIA-Lambdas\virus-scan
.\run-test.ps1
```

This script automatically clears environment variables and uses the `.env` file to connect to your backend database.

**See also:**
- [BACKEND-INTEGRATION.md](./docs/BACKEND-INTEGRATION.md) - Complete integration guide
- [SETUP.md](./docs/SETUP.md) - Installation and configuration
- [TESTING.md](./docs/TESTING.md) - Testing with real files

## Environment Variables

See `.env.example` for required environment variables.

## Getting Started

See [SETUP.md](./docs/SETUP.md) for installation and configuration instructions.

See [TESTING.md](./docs/TESTING.md) for local testing instructions.
