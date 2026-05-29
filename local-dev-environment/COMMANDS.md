# Virus Scan Integration - Quick Command Reference

## Quick Start Commands

### Run Local Integration Test (Simulated File)
```powershell
cd DESNZ-SYEIA-Lambdas\local-dev-environment
.\test-local-scan.ps1
```

### Run Integration Test with Real AWS S3 File
```powershell
.\test-db-driven-scan.ps1 `
  -S3Key "your-folder/your-file.png" `
  -BucketName "s3-eip-dev-storage" `
  -FileName "your-file.png" `
  -ContentType "image/png" `
  -FileSize 12345
```

### Test with Infected File (EICAR)
```powershell
.\test-local-scan.ps1 -CreateInfected
```

---

## Docker Commands

```powershell
# Start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f scan-worker-ecs

# Restart worker
docker compose restart scan-worker-ecs

# Stop all
docker compose down
```

---

## Database Commands

```powershell
# View uploaded files
docker compose exec -T postgres psql -U postgres -d appdb -c "SELECT * FROM uploaded_files ORDER BY uploaded_at_timestamp DESC LIMIT 10;"

# View scan events
docker compose exec -T postgres psql -U postgres -d appdb -c "SELECT * FROM file_scan_events ORDER BY scan_completed_at DESC LIMIT 10;"

# Check specific file scan status
docker compose exec -T postgres psql -U postgres -d appdb -c "SELECT * FROM file_scan_events WHERE file_id = 'YOUR-FILE-ID';"
```

---

## S3 Commands (Ministack)

```powershell
# Setup environment
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "eu-west-2"

# List files in clean bucket
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-clean/ --recursive

# List files in quarantine bucket
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-quarantine/ --recursive

# Create bucket
aws --endpoint-url=http://localhost:4566 s3 mb s3://your-bucket-name
```

---

## SQS Commands (Ministack)

```powershell
# Check messages in queue
aws --endpoint-url=http://localhost:4566 sqs receive-message `
  --queue-url http://localhost:4566/000000000000/scan-queue `
  --max-number-of-messages 10

# Send message manually
aws --endpoint-url=http://localhost:4566 sqs send-message `
  --queue-url http://localhost:4566/000000000000/scan-queue `
  --message-body '{\"eventId\":\"YOUR-EVENT-ID\",\"fileId\":\"YOUR-FILE-ID\"}'

# Purge queue
aws --endpoint-url=http://localhost:4566 sqs purge-queue `
  --queue-url http://localhost:4566/000000000000/scan-queue
```

---

## Troubleshooting

### Worker not processing?
```powershell
docker compose restart scan-worker-ecs
docker compose logs -f scan-worker-ecs
```

### Database issues?
```powershell
docker compose exec -T postgres pg_isready -U postgres -d appdb
docker compose restart postgres
```

### Queue stuck?
```powershell
aws --endpoint-url=http://localhost:4566 sqs purge-queue `
  --queue-url http://localhost:4566/000000000000/scan-queue
```

---

**For full documentation, see:** `VIRUS-SCAN-ARCHITECTURE.md`
