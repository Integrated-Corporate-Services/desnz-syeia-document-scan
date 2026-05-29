#!/bin/bash

echo "================================"
echo "LocalStack Resource Setup"
echo "================================"
echo ""
echo "Waiting for LocalStack to be fully ready..."
sleep 10

echo "Setting AWS credentials..."
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=eu-west-2

echo ""
echo "Creating S3 buckets for document scanning workflow..."

# Pre-scan bucket - where files are initially uploaded
awslocal s3 mb s3://uploads-pre-scan 2>/dev/null || echo "uploads-pre-scan bucket already exists"
awslocal s3api put-bucket-versioning --bucket uploads-pre-scan --versioning-configuration Status=Enabled 2>/dev/null

# Clean bucket - where virus-free files are moved
awslocal s3 mb s3://uploads-clean 2>/dev/null || echo "uploads-clean bucket already exists"
awslocal s3api put-bucket-versioning --bucket uploads-clean --versioning-configuration Status=Enabled 2>/dev/null

# Quarantine bucket - where infected files are moved
awslocal s3 mb s3://uploads-quarantine 2>/dev/null || echo "uploads-quarantine bucket already exists"
awslocal s3api put-bucket-versioning --bucket uploads-quarantine --versioning-configuration Status=Enabled 2>/dev/null

echo ""
echo "Creating SQS queues for virus scanning..."

# Main scan queue
awslocal sqs create-queue --queue-name scan-queue 2>/dev/null || echo "scan-queue already exists"

# Dead letter queue for failed scans
awslocal sqs create-queue --queue-name scan-queue-dlq 2>/dev/null || echo "scan-queue-dlq already exists"

echo ""
echo "Configuring Dead Letter Queue redrive policy..."
MAIN_QUEUE_URL=$(awslocal sqs get-queue-url --queue-name scan-queue --query 'QueueUrl' --output text 2>/dev/null)
DLQ_QUEUE_URL=$(awslocal sqs get-queue-url --queue-name scan-queue-dlq --query 'QueueUrl' --output text 2>/dev/null)

if [ ! -z "$MAIN_QUEUE_URL" ] && [ ! -z "$DLQ_QUEUE_URL" ]; then
    DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url $DLQ_QUEUE_URL --attribute-names QueueArn --query 'Attributes.QueueArn' --output text 2>/dev/null)
    
    if [ ! -z "$DLQ_ARN" ]; then
        awslocal sqs set-queue-attributes \
          --queue-url $MAIN_QUEUE_URL \
          --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" 2>/dev/null
        echo "✓ DLQ configured with 3 max retries"
    fi
fi

echo ""
echo "Setting up S3 event notification to SQS..."

# Create event notification configuration for uploads-pre-scan bucket
# Send S3 ObjectCreated events to scan-queue
SCAN_QUEUE_ARN=$(awslocal sqs get-queue-attributes --queue-url $MAIN_QUEUE_URL --attribute-names QueueArn --query 'Attributes.QueueArn' --output text 2>/dev/null)

if [ ! -z "$SCAN_QUEUE_ARN" ]; then
    cat > /tmp/notification-config.json <<EOF
{
  "QueueConfigurations": [
    {
      "QueueArn": "$SCAN_QUEUE_ARN",
      "Events": ["s3:ObjectCreated:*"],
      "Filter": {
        "Key": {
          "FilterRules": [
            {
              "Name": "prefix",
              "Value": "uploads/"
            }
          ]
        }
      }
    }
  ]
}
EOF

    awslocal s3api put-bucket-notification-configuration \
      --bucket uploads-pre-scan \
      --notification-configuration file:///tmp/notification-config.json 2>/dev/null
    
    echo "✓ S3 event notification configured"
    rm /tmp/notification-config.json
fi

echo ""
echo "================================"
echo "Resources Created Successfully!"
echo "================================"
echo ""
echo "S3 Buckets:"
echo "  - uploads-pre-scan      (initial upload destination)"
echo "  - uploads-clean         (virus-free files)"
echo "  - uploads-quarantine    (infected files)"
echo ""
echo "SQS Queues:"
echo "  - scan-queue           (main processing queue)"
echo "  - scan-queue-dlq       (dead letter queue, max 3 retries)"
echo ""
echo "Event Flow:"
echo "  1. Files uploaded to uploads-pre-scan trigger S3 events"
echo "  2. S3 events sent to scan-queue"
echo "  3. Scan worker processes files from scan-queue"
echo "  4. Clean files moved to uploads-clean"
echo "  5. Infected files moved to uploads-quarantine"
echo ""
echo "Verification:"
awslocal s3 ls 2>/dev/null
echo ""
awslocal sqs list-queues 2>/dev/null
echo ""
echo "LocalStack is ready for testing!"
