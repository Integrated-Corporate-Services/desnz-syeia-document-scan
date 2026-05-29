#!/bin/bash
set -e

echo "================================"
echo "Scan Worker Starting"
echo "================================"

# Check if we're in simulation mode
if [ "$SIMULATE_SCAN" = "true" ]; then
  echo "SIMULATE_SCAN is enabled - skipping ClamAV initialization"
  echo "  Files will be marked as clean without actual scanning"
  echo ""
  echo "================================"
  echo "Starting Document Scan Service (Simulation Mode)"
  echo "================================"
  echo ""
  exec node dist/server.js
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
# Ensure TCPSocket is enabled in clamd config — ClamAVClient.ts connects via TCP localhost:3310
if ! grep -q "^TCPSocket" /etc/clamav/clamd.conf 2>/dev/null; then
  echo "TCPSocket 3310" >> /etc/clamav/clamd.conf
  echo "TCPAddr 127.0.0.1" >> /etc/clamav/clamd.conf
fi
clamd &

# Wait for ClamAV Unix socket to be ready (indicates daemon is up)
echo "Waiting for ClamAV daemon to be ready..."
RETRY_COUNT=0
MAX_RETRIES=60

while [ ! -S /var/run/clamav/clamd.ctl ]; do
  sleep 1
  RETRY_COUNT=$((RETRY_COUNT + 1))

  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "ERROR: ClamAV daemon failed to start within $MAX_RETRIES seconds"
    exit 1
  fi

  if [ $((RETRY_COUNT % 10)) -eq 0 ]; then
    echo "Still waiting for ClamAV... ($RETRY_COUNT seconds elapsed)"
  fi
done

echo "✓ ClamAV daemon is ready (Unix socket)"

# Validate TCP port is also open — this is what ClamAVClient.ts uses (CLAMAV_HOST:CLAMAV_PORT)
echo "Testing ClamAV TCP connection (localhost:3310)..."
TCP_RETRY=0
while ! echo "PING" | nc -q1 localhost 3310 2>/dev/null | grep -q "PONG"; do
  sleep 1
  TCP_RETRY=$((TCP_RETRY + 1))
  if [ $TCP_RETRY -ge 10 ]; then
    echo "WARNING: ClamAV TCP port 3310 did not respond. Worker will use CLAMAV_HOST/CLAMAV_PORT env vars."
    break
  fi
done
if [ $TCP_RETRY -lt 10 ]; then
  echo "✓ ClamAV TCP connection test passed (localhost:3310)"
fi

echo ""
echo "================================"
echo "Starting Document Scan Service"
echo "================================"
echo ""

# Execute server.ts entry point (starts HTTP health server + SQS worker loop)
exec node dist/server.js