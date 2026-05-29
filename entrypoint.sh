#!/bin/bash
set -e

echo "================================"
echo "Scan Worker Starting"
echo "================================"

# Check if we're in simulation mode
if [ "$SIMULATE_SCAN" = "true" ]; then
  echo "⚠ SIMULATE_SCAN is enabled - skipping ClamAV initialization"
  echo "  Files will be marked as clean without actual scanning"
  echo ""
  echo "================================"
  echo "Starting Scan Worker Process (Simulation Mode)"
  echo "================================"
  echo ""
  exec node dist/worker.js
fi

# Real scanning mode - setup ClamAV
echo "Real scanning mode - initializing ClamAV..."

# Ensure directories exist and have correct permissions
mkdir -p /var/run/clamav
chown clamav:clamav /var/run/clamav || true

# Check if virus definitions exist, if not download them
if [ ! -f /var/lib/clamav/main.cvd ] && [ ! -f /var/lib/clamav/main.cld ]; then
  echo "Virus definitions not found. Downloading with freshclam..."
  echo "This may take a few minutes on first run..."
  freshclam || {
    echo "WARNING: freshclam failed. Attempting to continue with bytecode database only..."
    # Create a minimal database to allow ClamAV to start
    touch /var/lib/clamav/bytecode.cvd || true
  }
else
  echo "✓ Virus definitions found"
fi

echo "Starting ClamAV daemon..."
clamd &

# Wait for ClamAV socket to be ready
echo "Waiting for ClamAV to be ready..."
RETRY_COUNT=0
MAX_RETRIES=60

while [ ! -S /var/run/clamav/clamd.ctl ]; do
  sleep 1
  RETRY_COUNT=$((RETRY_COUNT + 1))
  
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: ClamAV failed to start within $MAX_RETRIES seconds"
    exit 1
  fi
  
  if [ $((RETRY_COUNT % 10)) -eq 0 ]; then
    echo "Still waiting for ClamAV... ($RETRY_COUNT seconds)"
  fi
done

echo "✓ ClamAV daemon is ready"

# Test ClamAV connection
echo "Testing ClamAV connection..."
if echo "PING" | nc -U /var/run/clamav/clamd.ctl | grep -q "PONG"; then
  echo "✓ ClamAV connection test passed"
else
  echo "WARNING: ClamAV connection test failed, but continuing anyway"
fi

echo ""
echo "================================"
echo "Starting Scan Worker Process"
echo "================================"
echo ""

# Execute the worker process
exec node dist/worker.js
