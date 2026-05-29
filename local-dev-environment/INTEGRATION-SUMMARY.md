# Integration Summary

## Overview

Successfully integrated the Backend API and Scan Worker Lambda into the local development environment using LocalStack and Docker Compose.

## Changes Made

### 1. Virus Scan Worker (`DESNZ-SYEIA-Lambdas/virus-scan/`)

#### New Files Created:
- **`worker.ts`**: Long-running SQS polling worker that wraps the Lambda handler
  - Polls SQS queue continuously
  - Converts SQS messages to Lambda event format
  - Calls the existing handler function
  - Deletes messages after successful processing
  - Supports graceful shutdown

- **`Dockerfile`**: Multi-stage Docker build
  - Build stage: Compiles TypeScript
  - Runtime stage: Node 18 with ClamAV installed
  - Installs `clamav`, `clamav-daemon`, `clamav-freshclam`
  - Updates virus definitions during build
  - Runs as `clamav` user for security

- **`entrypoint.sh`**: Container startup script
  - Creates ClamAV runtime directories
  - Starts `clamd` daemon in background
  - Waits for ClamAV socket to be ready (up to 60 seconds)
  - Tests ClamAV connection with PING/PONG
  - Starts the worker process

### 2. Local Development Environment (`DESNZ-SYEIA-Lambdas/local-dev-environment/`)

#### Updated Files:

**`docker-compose.yml`**:
- Removed standalone `clamav` service (now bundled in scan-worker)
- Added `backend` service:
  - Builds from `desnz-syeia-backend-beta` folder
  - Exposes port 3001
  - Connected to PostgreSQL and LocalStack
  - Environment variables for AWS and database
  - Health check on `/health` endpoint
  - Source volume mount for hot reload

- Added `scan-worker` service:
  - Builds from `virus-scan` folder
  - Connected to PostgreSQL, LocalStack, and ClamAV (internal)
  - Environment variables for database, AWS, and SQS
  - `SIMULATE_SCAN` flag for development mode
  - Restart policy: `unless-stopped`

**`localstack-init/01-setup-resources.sh`**:
- Creates three S3 buckets:
  - `uploads-pre-scan`: Initial upload destination
  - `uploads-clean`: Clean files after scanning
  - `uploads-quarantine`: Infected files
- Creates two SQS queues:
  - `scan-queue`: Main processing queue
  - `scan-queue-dlq`: Dead letter queue (max 3 retries)
- Configures DLQ redrive policy
- Sets up S3 event notification:
  - Triggers on `s3:ObjectCreated:*` events
  - Filter: prefix `uploads/`
  - Sends events to `scan-queue`

**`postgres-init/01-create-schema.sql`**:
- Added enums:
  - `scan_status_enum`: PENDING_SCAN, AVAILABLE, QUARANTINED, REJECTED
  - `commit_status_enum`: DRAFT, COMMITTED, DELETE_PENDING
- Added `documents` table for backend:
  - Tracks document metadata
  - Links drafts and sections
  - Stores scan and commit status
  - References S3 location
- Added indexes for performance:
  - Task list queries
  - Cleanup operations
  - S3 key lookups
- Retained existing `uploaded_files` and `file_scan_events` tables
- Granted permissions to `syeia_user`

#### New Files Created:

**`.env`** & **`.env.example`**:
- `SIMULATE_SCAN`: Toggle between simulated and real ClamAV scanning
- Documented all environment variables with defaults

**`README.md`** (updated):
- Complete documentation of the integrated architecture
- Architecture flow diagram
- Service endpoints table
- Quick start guide
- Troubleshooting section
- Development workflow instructions

**`TESTING.md`**:
- Comprehensive testing guide
- 12 test scenarios covering:
  - Backend health checks
  - Document upload flow
  - Infected file detection
  - Task list status
  - Document operations (save, delete, discard)
  - S3 bucket verification
  - SQS queue verification
  - Database verification
  - Worker log analysis
  - Real ClamAV testing
- PowerShell examples for all tests
- Performance benchmarks
- Cleanup instructions

**`start-full.ps1`**:
- Automated startup script
- Checks Docker availability
- Starts all services
- Waits for health checks (with timeout)
- Tests backend connectivity
- Displays service information and credentials
- User-friendly output with colors

**`verify-integration.ps1`**:
- Automated integration test suite
- 12 verification tests:
  1. Docker daemon running
  2. All containers up
  3. PostgreSQL healthy
  4. Database schema exists
  5. LocalStack healthy
  6. S3 buckets created
  7. SQS queues created
  8. S3 event notification configured
  9. Backend API responding
  10. Backend routes accessible
  11. Scan worker running
  12. DLQ redrive policy configured
- Summary report with pass/fail counts
- Verbose mode for debugging

## Architecture

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐
│ Frontend│────▶│ Backend API │────▶│ LocalStack   │
└─────────┘     │ (Express)   │     │ S3 + SQS     │
                └─────────────┘     └──────────────┘
                       │                    │
                       │                    ▼
                       ▼            ┌──────────────┐
                ┌──────────┐        │ Scan Worker  │
                │PostgreSQL│◀───────│ + ClamAV     │
                └──────────┘        └──────────────┘
```

## Document Scanning Workflow

1. **Upload Request**: Frontend requests presigned URL from backend
2. **Presigned URL**: Backend creates document record (PENDING_SCAN) and returns S3 presigned PUT URL
3. **File Upload**: Frontend uploads file directly to `uploads-pre-scan` bucket
4. **S3 Event**: S3 sends ObjectCreated event to `scan-queue`
5. **Worker Poll**: Scan worker receives message from SQS
6. **Scan Process**:
   - Worker downloads file from S3
   - Streams file to ClamAV
   - Receives scan result
7. **File Movement**:
   - Clean → `uploads-clean` bucket
   - Infected → `uploads-quarantine` bucket
   - Delete from `uploads-pre-scan`
8. **Database Update**: Worker updates document record (AVAILABLE or QUARANTINED)
9. **Status Poll**: Frontend polls backend for scan status
10. **Commit**: User saves documents, backend marks as COMMITTED

## Environment Variables

### Backend
- `PORT`: 3001
- `DATABASE_URL`: PostgreSQL connection string
- `AWS_REGION`: eu-west-2
- `AWS_ENDPOINT`: http://localstack:4566 (internal)
- `AWS_ENDPOINT_PUBLIC`: http://localhost:4566 (for presigned URLs)
- `S3_UPLOADS_BUCKET`: uploads-pre-scan
- `S3_CLEAN_BUCKET`: uploads-clean
- `S3_QUARANTINE_BUCKET`: uploads-quarantine

### Scan Worker
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`: PostgreSQL connection
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: AWS credentials
- `AWS_ENDPOINT`: http://localstack:4566
- `SQS_SCAN_QUEUE_URL`: http://localstack:4566/000000000000/scan-queue
- `SQS_POLL_WAIT_SECONDS`: 10
- `SQS_VISIBILITY_TIMEOUT`: 300
- `SIMULATE_SCAN`: true/false

## Simulate Scan Mode

When `SIMULATE_SCAN=true`:
- Skips actual ClamAV scanning
- Uses filename heuristic:
  - Files with "infected" in name → QUARANTINED
  - All other files → AVAILABLE
- Adds 1.5s artificial delay
- Useful for development and testing without waiting for ClamAV

When `SIMULATE_SCAN=false`:
- Uses real ClamAV scanning
- Streams file bytes to clamd daemon
- Detects real viruses (including EICAR test)
- Slower but production-accurate

## Usage

### Start Environment
```powershell
cd local-dev-environment
docker compose up -d
```

Or use the automated script:
```powershell
.\start-full.ps1
```

### Verify Integration
```powershell
.\verify-integration.ps1
```

### Run Tests
Follow the guide in `TESTING.md` for comprehensive API testing.

### View Logs
```powershell
docker compose logs -f backend
docker compose logs -f scan-worker
docker compose logs -f localstack
docker compose logs -f postgres
```

### Stop Environment
```powershell
docker compose down
```

## Known Limitations

### Backend
- No authentication on endpoints (IDOR vulnerability)
- `sectionId` not validated against allowlist
- Confirm endpoint doesn't verify S3 object exists (HeadObject)
- No reconciliation job for `DELETE_PENDING` records
- No download endpoint (presigned GET URL)

### Scan Worker
- No idempotency guard on database UPDATE
- No DLQ alerting/monitoring
- `freshclam` not automated (virus definitions)
- No S3 server-side encryption on quarantine bucket

### LocalStack
- Not suitable for production (use real AWS services)
- Limited to S3 and SQS services
- No IAM authentication

## Next Steps for Production

1. **Backend**:
   - Add session middleware and authentication
   - Implement `sectionId` validation
   - Add `HeadObject` check in confirm endpoint
   - Create download endpoint with presigned GET URLs
   - Implement reconciliation job for cleanup

2. **Scan Worker**:
   - Add idempotency guard (`WHERE scan_status = 'PENDING_SCAN'`)
   - Set up CloudWatch alarms for DLQ
   - Automate `freshclam` updates (cron or sidecar)
   - Enable S3 SSE-KMS on quarantine bucket

3. **Infrastructure**:
   - Replace LocalStack with real AWS
   - Set up proper IAM roles and policies
   - Configure VPC and security groups
   - Enable CloudWatch logging
   - Set up monitoring and alerting

## File Locations

```
DESNZ-SYEIA-Lambdas/
├── virus-scan/
│   ├── Dockerfile                    ✅ NEW
│   ├── entrypoint.sh                 ✅ NEW
│   ├── worker.ts                     ✅ NEW
│   ├── handler.ts                    (existing)
│   └── src/                          (existing)
│
└── local-dev-environment/
    ├── docker-compose.yml            ✅ UPDATED
    ├── .env                          ✅ NEW
    ├── .env.example                  ✅ NEW
    ├── README.md                     ✅ UPDATED
    ├── TESTING.md                    ✅ NEW
    ├── start-full.ps1                ✅ NEW
    ├── verify-integration.ps1        ✅ NEW
    ├── localstack-init/
    │   └── 01-setup-resources.sh     ✅ UPDATED
    └── postgres-init/
        └── 01-create-schema.sql      ✅ UPDATED

desnz-syeia-backend-beta/
├── Dockerfile                        (existing)
├── src/                              (existing)
└── ...
```

## Success Criteria ✅

- [x] Backend integrated and accessible on port 3001
- [x] Scan worker polling SQS and processing messages
- [x] ClamAV running within scan worker container
- [x] S3 buckets created with proper event notifications
- [x] SQS queues created with DLQ redrive policy
- [x] PostgreSQL schema includes all required tables
- [x] Complete documentation and testing guides
- [x] Automated startup and verification scripts
- [x] Both simulated and real scanning modes supported
