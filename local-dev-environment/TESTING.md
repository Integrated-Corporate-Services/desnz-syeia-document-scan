# Testing Guide - SYEIA Document Scanning Workflow

This guide provides comprehensive testing instructions for the local development environment.

## Prerequisites

Ensure all services are running:

```powershell
cd C:\Users\ChoudhariSushant(ICS\Desktop\fontend\DESNZ-SYEIA-Lambdas\local-dev-environment
docker compose up -d
docker compose ps  # All should show "Up" or "Up (healthy)"
```

## Test 1: Backend Health Check

```powershell
# Test backend is responding
Invoke-RestMethod -Uri "http://localhost:3001/health"

# Expected output:
# {
#   "status": "ok",
#   "db": "ok",
#   "timestamp": "2024-..."
# }
```

## Test 2: Complete Document Upload Flow

### Step 1: Request Presigned URL

```powershell
$draftId = [guid]::NewGuid().ToString()
$uploadRequest = @{
    draftId = $draftId
    sectionId = "identity"
    fileName = "passport.pdf"
    fileType = "application/pdf"
    fileSize = 204800
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/upload/presigned-url" `
  -Method POST `
  -ContentType "application/json" `
  -Body $uploadRequest

Write-Host "Document ID: $($response.documentId)"
Write-Host "Upload URL: $($response.uploadUrl)"
Write-Host "S3 Key: $($response.s3Key)"
```

### Step 2: Upload File to S3

Create a test file:

```powershell
# Create a test PDF file (or use an existing one)
$testContent = "This is a test PDF document content"
$testFile = "test-passport.pdf"
Set-Content -Path $testFile -Value $testContent

# Upload to presigned URL
Invoke-RestMethod -Uri $response.uploadUrl `
  -Method PUT `
  -InFile $testFile `
  -ContentType "application/pdf"

Write-Host "✓ File uploaded successfully"
```

### Step 3: Confirm Upload

```powershell
$confirmRequest = @{
    documentId = $response.documentId
} | ConvertTo-Json

$confirmResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/upload/confirm" `
  -Method POST `
  -ContentType "application/json" `
  -Body $confirmRequest

Write-Host "Scan Status: $($confirmResponse.scanStatus)"
# Expected: PENDING_SCAN
```

### Step 4: Poll for Scan Status

```powershell
$documentId = $response.documentId
$maxAttempts = 15
$attempt = 0

do {
    Start-Sleep -Seconds 2
    $attempt++
    
    $statusResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/upload/status/$documentId"
    Write-Host "[$attempt/$maxAttempts] Status: $($statusResponse.scanStatus)"
    
    if ($statusResponse.scanStatus -in @("AVAILABLE", "QUARANTINED", "REJECTED")) {
        Write-Host "✓ Scan completed: $($statusResponse.scanStatus)" -ForegroundColor Green
        break
    }
} while ($attempt -lt $maxAttempts)
```

### Step 5: Verify Document List

```powershell
$documents = Invoke-RestMethod -Uri "http://localhost:3001/api/documents/$draftId/identity"

Write-Host "`nDocuments in section:"
$documents | Format-Table -Property original_name, scan_status, commit_status, created_at
```

## Test 3: Infected File Detection

Test the quarantine flow by uploading a file with "infected" in the name (when `SIMULATE_SCAN=true`):

```powershell
$draftId = [guid]::NewGuid().ToString()
$uploadRequest = @{
    draftId = $draftId
    sectionId = "identity"
    fileName = "infected-test-document.pdf"
    fileType = "application/pdf"
    fileSize = 1024
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3001/api/upload/presigned-url" `
  -Method POST `
  -ContentType "application/json" `
  -Body $uploadRequest

# Create and upload test file
$testFile = "infected-test.pdf"
Set-Content -Path $testFile -Value "Test infected file"

Invoke-RestMethod -Uri $response.uploadUrl -Method PUT -InFile $testFile -ContentType "application/pdf"

# Confirm and wait
$confirmRequest = @{ documentId = $response.documentId } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/upload/confirm" -Method POST -ContentType "application/json" -Body $confirmRequest

# Poll for status
Start-Sleep -Seconds 5
$status = Invoke-RestMethod -Uri "http://localhost:3001/api/upload/status/$($response.documentId)"

Write-Host "`nExpected: QUARANTINED"
Write-Host "Actual: $($status.scanStatus)" -ForegroundColor $(if ($status.scanStatus -eq "QUARANTINED") { "Green" } else { "Red" })
```

## Test 4: Task List Status

```powershell
$draftId = "550e8400-e29b-41d4-a716-446655440000"  # Use a draft ID from previous tests

$taskList = Invoke-RestMethod -Uri "http://localhost:3001/api/tasklist/$draftId"

Write-Host "`nTask List Status:"
$taskList | Format-Table -Property sectionId, status, committedCount, draftCount, pendingCount
```

## Test 5: Save Documents (Commit)

```powershell
$draftId = "550e8400-e29b-41d4-a716-446655440000"
$saveRequest = @{
    draftId = $draftId
    sectionId = "identity"
} | ConvertTo-Json

$saveResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/documents/save" `
  -Method POST `
  -ContentType "application/json" `
  -Body $saveRequest

Write-Host "`nSave Results:"
Write-Host "Committed: $($saveResponse.committed)"
Write-Host "Skipped (Pending Scan): $($saveResponse.skippedPendingScan)"
```

## Test 6: Delete Document

```powershell
$documentId = "your-document-id-here"  # Use ID from upload test

Invoke-RestMethod -Uri "http://localhost:3001/api/documents/$documentId" -Method DELETE

Write-Host "✓ Document marked for deletion"

# Verify
$documents = Invoke-RestMethod -Uri "http://localhost:3001/api/documents/$draftId/identity"
$deleted = $documents | Where-Object { $_.id -eq $documentId }

if ($deleted.commit_status -eq "DELETE_PENDING") {
    Write-Host "✓ Document status updated to DELETE_PENDING" -ForegroundColor Green
}
```

## Test 7: Discard Draft Documents

```powershell
$draftId = "your-draft-id-here"
$sectionId = "identity"

$discardResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/documents/drafts/$draftId/$sectionId" -Method DELETE

Write-Host "✓ All draft documents in section marked for deletion"
```

## Test 8: Verify S3 Buckets

```powershell
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"

Write-Host "`nS3 Buckets:"
aws --endpoint-url=http://localhost:4566 s3 ls

Write-Host "`nFiles in uploads-pre-scan:"
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-pre-scan/uploads/ --recursive

Write-Host "`nFiles in uploads-clean:"
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-clean/uploads/ --recursive

Write-Host "`nFiles in uploads-quarantine:"
aws --endpoint-url=http://localhost:4566 s3 ls s3://uploads-quarantine/uploads/ --recursive
```

## Test 9: Verify SQS Queue

```powershell
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"

$queueUrl = "http://localhost:4566/000000000000/scan-queue"

Write-Host "`nSQS Queue Attributes:"
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes `
  --queue-url $queueUrl `
  --attribute-names All

Write-Host "`nMessages in Queue:"
aws --endpoint-url=http://localhost:4566 sqs receive-message `
  --queue-url $queueUrl `
  --max-number-of-messages 1
```

## Test 10: Database Verification

```powershell
# Connect to PostgreSQL and verify data
docker compose exec postgres psql -U syeia_user -d syeia_db -c "
SELECT 
    id, 
    original_name, 
    scan_status, 
    commit_status,
    created_at
FROM documents
ORDER BY created_at DESC
LIMIT 10;
"
```

## Test 11: Scan Worker Logs

Verify the scan worker is processing messages:

```powershell
docker compose logs -f scan-worker --tail 50
```

Look for:
- `[worker] Starting SQS poll loop`
- `[worker] Processing message`
- `[worker] Message processed and deleted`
- `ClamAV daemon is ready`

## Test 12: Real ClamAV Scanning

To test with real ClamAV (not simulated):

1. Update `.env`:
   ```env
   SIMULATE_SCAN=false
   ```

2. Restart scan worker:
   ```powershell
   docker compose restart scan-worker
   ```

3. Upload EICAR test file:
   ```powershell
   # EICAR test virus string (safe test virus)
   $eicarContent = 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
   Set-Content -Path "eicar.txt" -Value $eicarContent -NoNewline
   
   # Upload using the standard flow
   # This should be detected as infected and moved to quarantine
   ```

## Troubleshooting Tests

### Test Fails: Connection Refused

```powershell
# Check if services are running
docker compose ps

# Restart services
docker compose restart backend
docker compose restart scan-worker
```

### Test Fails: Scan Never Completes

```powershell
# Check scan worker logs
docker compose logs scan-worker --tail 100

# Check SQS queue
aws --endpoint-url=http://localhost:4566 sqs get-queue-attributes `
  --queue-url http://localhost:4566/000000000000/scan-queue `
  --attribute-names ApproximateNumberOfMessages
```

### Test Fails: File Not Found in S3

```powershell
# Verify S3 event notification is configured
aws --endpoint-url=http://localhost:4566 s3api get-bucket-notification-configuration `
  --bucket uploads-pre-scan

# Should show QueueConfiguration pointing to scan-queue
```

## Performance Benchmarks

Expected timings (with `SIMULATE_SCAN=true`):
- Presigned URL generation: < 100ms
- S3 upload: varies by file size
- SQS message delivery: < 1s
- Scan processing: ~1.5s (simulated)
- Database update: < 100ms
- Total end-to-end: 3-5 seconds

With real ClamAV (`SIMULATE_SCAN=false`):
- Scan processing: 2-10 seconds depending on file size
- Total end-to-end: 5-15 seconds

## Cleanup After Testing

```powershell
# Remove test files
Remove-Item test-*.pdf, eicar.txt -ErrorAction SilentlyContinue

# Clear database (optional)
docker compose exec postgres psql -U syeia_user -d syeia_db -c "TRUNCATE documents CASCADE;"

# Clear S3 buckets (optional)
aws --endpoint-url=http://localhost:4566 s3 rm s3://uploads-pre-scan --recursive
aws --endpoint-url=http://localhost:4566 s3 rm s3://uploads-clean --recursive
aws --endpoint-url=http://localhost:4566 s3 rm s3://uploads-quarantine --recursive
```
