# Production Dockerfile for Send Time Optimization Activity
# Multi-stage build for optimized production image

# =============================================================================
# Build Stage
# =============================================================================
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Remove development files
RUN rm -rf tests/ \
    *.test.js \
    .env.example \
    .env \
    README.md \
    docs/ \
    .git/

# =============================================================================
# Production Stage
# =============================================================================
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S sto-user -u 1001

# Set working directory
WORKDIR /app

# Install production system dependencies
RUN apk add --no-cache \
    ca-certificates \
    tzdata \
    curl \
    && rm -rf /var/cache/apk/*

# Copy built application from builder stage
COPY --from=builder --chown=sto-user:nodejs /app .

# Create necessary directories with proper permissions
RUN mkdir -p /var/log/sto-activity && \
    mkdir -p /app/data/holidays && \
    mkdir -p /app/ssl && \
    chown -R sto-user:nodejs /var/log/sto-activity && \
    chown -R sto-user:nodejs /app/data && \
    chown -R sto-user:nodejs /app/ssl

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER sto-user

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server-production.js"]