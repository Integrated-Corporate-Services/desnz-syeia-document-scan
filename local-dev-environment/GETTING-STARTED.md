# Complete Local Testing Setup - Quick Start Guide

## 🚀 What You Need

- Docker Desktop (running)
- AWS CLI
- Node.js 18.x
- PowerShell 5.1+

## 📦 What's Included

```
local-dev-environment/
├── docker-compose.yml           # Main Docker setup
├── start.ps1                    # Start all services
├── stop.ps1                     # Stop all services
├── check-status.ps1             # Check status of everything
├── upload-test-file.ps1         # Upload test files to S3
├── send-sqs-message.ps1         # Send test SQS messages
├── logs.ps1                     # View service logs
├── .env.local                   # Environment configuration
└── README.md                    # Full documentation

Services:
✓ ClamAV (virus scanner)         - Port 3310
✓ LocalStack (AWS emulation)     - Port 4566
  - S3 (file storage)
  - SQS (message queue)
✓ PostgreSQL (database)          - Port 5432
```

## 🎯 One-Command Start

```powershell
cd C:\Users\ChoudhariSushant(ICS\Desktop\fontend\DESNZ-SYEIA-Lambdas\local-dev-environment
.\start.ps1
```

**Wait 2-3 minutes** for ClamAV to download virus definitions.

## 🧪 Complete Test Workflow

### Step 1: Start Environment

```powershell
cd C:\Users\ChoudhariSushant(ICS\Desktop\fontend\DESNZ-SYEIA-Lambdas\local-dev-environment
.\start.ps1
```

### Step 2: Upload Test Files

```powershell
.\upload-test-file.ps1
```

This creates:
- `test-file.txt` - Clean file
- `eicar.txt` - Test virus file

### Step 3: Setup Lambda

```powershell
# Copy environment config
cp .env.local ..\virus-scan\.env

# Install and build Lambda
cd ..\virus-scan
npm install
npm run build
```

### Step 4: Run Lambda Test

```powershell
# In virus-scan folder
.\load-env.ps1
npm run dev
```

### Step 5: Verify Results

```powershell
# Check status of everything
cd ..\local-dev-environment
.\check-status.ps1
```

## 📊 What Should Happen

1. **Lambda starts** and reads SQS message
2. **Downloads file** from LocalStack S3
3. **Scans with ClamAV** for viruses
4. **Moves file** to clean/ or infected/ folder
5. **Updates PostgreSQL** with scan results

## ✅ Verification

### Check Database

```powershell
# From local-dev-environment folder
docker exec -it postgres psql -U syeia_user -d syeia_db

# Query results
SELECT id, filename, scan_status, scan_result, virus_name 
FROM uploaded_files;
```

Expected:
- scan_status: `COMPLETED`
- scan_result: `CLEAN` (for test-file.txt) or `INFECTED` (for eicar.txt)

### Check S3

```powershell
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"

aws s3 ls s3://virus-scan-test-bucket/ --recursive --endpoint-url=http://localhost:4566
```

Expected:
- `clean/test-file.txt` (if scanned as clean)
- `infected/eicar.txt` (if scanned as infected)

## 🔍 Useful Commands

### Check Service Status

```powershell
.\check-status.ps1
```

Shows:
- Service health
- Database records
- S3 file list
- SQS queue depths

### View Logs

```powershell
# All services
.\logs.ps1

# Specific service
.\logs.ps1 clamav
.\logs.ps1 localstack
.\logs.ps1 postgres
```

### Manual SQS Test

```powershell
# Send message to queue
.\send-sqs-message.ps1 -FileId "a0b1c2d3-e4f5-6789-0abc-def123456789"

# Receive message
aws sqs receive-message `
  --queue-url http://localhost:4566/000000000000/virus-scan-queue `
  --endpoint-url=http://localhost:4566
```

### Upload Custom File

```powershell
# Create your test file
"My custom content" | Out-File custom-test.txt

# Upload to LocalStack S3
aws s3 cp custom-test.txt s3://virus-scan-test-bucket/custom-test.txt --endpoint-url=http://localhost:4566

# Add database record
docker exec -it postgres psql -U syeia_user -d syeia_db
```

```sql
INSERT INTO uploaded_files (
    id, storage_provider, s3_key, bucket_name, 
    virtual_folder, filename, file_content_type, 
    file_size_bytes, uploaded_at_timestamp
) VALUES (
    'your-uuid-here',
    's3', 'custom-test.txt', 'virus-scan-test-bucket',
    'uploads', 'custom-test.txt', 'text/plain',
    1024, NOW()
);
```

## 🛠️ Troubleshooting

### ClamAV Not Ready

```powershell
.\logs.ps1 clamav
# Wait for "clamd is ready"
```

### LocalStack Issues

```powershell
# Restart
docker-compose restart localstack

# Check logs
.\logs.ps1 localstack
```

### Database Connection Failed

```powershell
# Check if running
docker exec postgres pg_isready -U syeia_user -d syeia_db

# Restart
docker-compose restart postgres
```

### Reset Everything

```powershell
# Stop and remove all data
docker-compose down -v

# Start fresh
.\start.ps1
```

## 📝 Environment Variables

Pre-configured in `.env.local`:

```env
# Database
PGHOST=localhost
PGPORT=5432
PGDATABASE=syeia_db
PGUSER=syeia_user
PGPASSWORD=syeia_password
PGSSLMODE=disable

# ClamAV
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# AWS (LocalStack)
AWS_REGION=eu-west-2
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_ENDPOINT=http://localhost:4566
SQS_ENDPOINT=http://localhost:4566
```

## 🎓 Test Scenarios

### Scenario 1: Clean File Scan

1. Upload: `test-file.txt`
2. Run Lambda
3. Verify: File in `clean/`, DB shows `CLEAN`

### Scenario 2: Infected File Scan

1. Upload: `eicar.txt`
2. Run Lambda
3. Verify: File in `infected/`, DB shows `INFECTED` with virus name

### Scenario 3: Idempotency Test

1. Run Lambda with same eventId twice
2. Second run should skip (already processed)

### Scenario 4: Error Handling

1. Stop ClamAV: `docker stop clamav`
2. Run Lambda
3. Should fail and message returned to queue for retry

## 📚 Full Documentation

See [README.md](./README.md) for complete documentation including:
- Detailed architecture
- All available scripts
- Database schema
- LocalStack usage
- Monitoring and debugging

## 🎉 Success Indicators

You know it's working when:

✓ All services show green in `check-status.ps1`
✓ Database has scan_status = `COMPLETED`
✓ Files moved to `clean/` or `infected/` folders in S3
✓ No errors in Lambda console output
✓ file_scan_events table has records

## 🆘 Get Help

1. Check logs: `.\logs.ps1`
2. Check status: `.\check-status.ps1`
3. View service health in Docker Desktop
4. Review [../virus-scan/docs/TESTING.md](../virus-scan/docs/TESTING.md)

## 🎬 Video Walkthrough Steps

1. Start services → Wait for ready
2. Upload test files → Verify in S3
3. Copy .env config → Build Lambda
4. Run Lambda test → Watch console
5. Check results → Database + S3

## 🚦 Stop & Clean Up

```powershell
# Stop (keep data)
.\stop.ps1

# Stop and remove all data
docker-compose down -v
```

## 🔄 Daily Workflow

```powershell
# Morning: Start
.\start.ps1

# Development: Test changes
cd ..\virus-scan
npm run build
.\load-env.ps1
npm run dev

# Check results
cd ..\local-dev-environment
.\check-status.ps1

# Evening: Stop
.\stop.ps1
```

---

**Ready to go!** Start with `.\start.ps1` and follow Step 1-5 above. 🚀
