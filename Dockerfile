# ---- Build stage ----
FROM public.ecr.aws/docker/library/node:22 AS builder

WORKDIR /app

# Install ALL deps (including dev) so tsc is available
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Compile TypeScript → dist/
RUN npm run build

# Sanity check: entry point must exist after build
RUN test -f ./dist/server.js || (echo "ERROR: dist/server.js missing after build"; ls -R dist; exit 1)

# ---- Runtime stage with ClamAV ----
FROM public.ecr.aws/docker/library/node:22 AS runtime

# Install ClamAV and dependencies
RUN apt-get update && apt-get install -y \
    clamav \
    clamav-daemon \
    clamav-freshclam \
    netcat-openbsd \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create ClamAV directories with correct ownership
RUN mkdir -p /var/run/clamav /var/lib/clamav /var/log/clamav \
    && chown -R clamav:clamav /var/run/clamav /var/lib/clamav /var/log/clamav

# Copy freshclam configuration
COPY freshclam.conf /etc/clamav/freshclam.conf
RUN chown clamav:clamav /etc/clamav/freshclam.conf

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled application from builder
COPY --from=builder /app/dist ./dist

# Copy entrypoint script into working directory (matches backend/ pattern)
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Expose health check port (served by server.ts — matches document-management-service pattern)
EXPOSE 3004


HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -sf http://localhost:3004/health || exit 1

CMD ["./entrypoint.sh"]