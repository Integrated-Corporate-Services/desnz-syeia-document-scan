# Document Scan Service

Production-grade virus scanning service using ClamAV for Node.js applications.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22.x-brightgreen)](package.json)

## What it does

Provides asynchronous malware scanning for file uploads. When a file is uploaded to S3:

1. Receives scan request via SQS
2. Downloads and scans file with ClamAV
3. Moves clean files to clean bucket, infected files to quarantine
4. Updates PostgreSQL database with scan results

## Quick Start

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your configuration
npm run build
npm start
```

## Architecture

```
S3 → SQS → ECS Worker → ClamAV → S3 (clean/quarantine) → PostgreSQL
```

## Configuration

Required environment variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=appdb

# AWS
AWS_REGION=eu-west-2
S3_UPLOADS_BUCKET=uploads-bucket
S3_CLEAN_BUCKET=clean-bucket
S3_QUARANTINE_BUCKET=quarantine-bucket
SQS_SCAN_QUEUE_URL=https://sqs...

# ClamAV
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
```

See `.env.example` for full options.

## Project Structure

```
src/
├── config/          # Configuration
├── constants/       # Constants
├── errors/          # Error types
├── queries/         # SQL queries
├── repositories/    # Database access
├── services/        # ClamAV, S3 services
├── types/          # TypeScript types
├── utils/          # Utilities
├── workflows/      # Processing workflows
├── app.ts
├── server.ts
└── worker.ts
```

## Testing

```bash
npm run test:unit
npm run test:integration
npm run test:coverage
```

## Deployment

### AWS ECS

```yaml
TaskDefinition:
  ContainerDefinitions:
    - Name: scan-worker
      Image: your-ecr-repo/document-scan:latest
      Secrets:
        - Name: DB_PASSWORD
          ValueFrom: arn:aws:secretsmanager:...
```

### Docker

```bash
docker build -t document-scan .
docker-compose up
```

## Security

- AWS Secrets Manager for credentials
- Database SSL/TLS encryption
- S3 bucket encryption (AES-256)
- ClamAV auto-updates every 2 hours

Report vulnerabilities: [SECURITY.md](SECURITY.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)



## License

[MIT License](LICENSE)

---

Maintained by DESNZ SYEIA Team


