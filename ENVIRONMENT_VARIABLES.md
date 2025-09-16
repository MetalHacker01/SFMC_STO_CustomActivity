# Environment Variables Configuration Guide

This document provides a comprehensive guide to all environment variables used by the Send Time Optimization (STO) Custom Journey Activity.

## Table of Contents

1. [Core Application Settings](#core-application-settings)
2. [Security Configuration](#security-configuration)
3. [SFMC Integration](#sfmc-integration)
4. [Send Time Optimization Settings](#send-time-optimization-settings)
5. [External Services](#external-services)
6. [Performance and Caching](#performance-and-caching)
7. [Logging Configuration](#logging-configuration)
8. [Monitoring and Alerting](#monitoring-and-alerting)
9. [Database Configuration](#database-configuration)
10. [Feature Flags](#feature-flags)
11. [Deployment Settings](#deployment-settings)

## Core Application Settings

### Basic Server Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Application environment (development, production, test) |
| `PORT` | No | `3000` | Port number for the server to listen on |
| `HOST` | No | `0.0.0.0` | Host address to bind the server to |
| `APP_VERSION` | No | `1.0.0` | Application version for logging and monitoring |
| `BUILD_NUMBER` | No | - | Build number for deployment tracking |
| `DEPLOYMENT_DATE` | No | - | Deployment timestamp for tracking |

### SSL/TLS Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SSL_ENABLED` | No | `false` | Enable HTTPS server with SSL/TLS |
| `SSL_KEY_PATH` | Conditional | - | Path to SSL private key file (required if SSL enabled) |
| `SSL_CERT_PATH` | Conditional | - | Path to SSL certificate file (required if SSL enabled) |
| `SSL_CA_PATH` | No | - | Path to SSL CA bundle file |

### Server Timeouts

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVER_TIMEOUT` | No | `30000` | Server timeout in milliseconds |
| `KEEP_ALIVE_TIMEOUT` | No | `65000` | Keep-alive timeout in milliseconds |
| `HEADERS_TIMEOUT` | No | `66000` | Headers timeout in milliseconds |

## Security Configuration

### JWT Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT token validation (min 32 characters) |
| `JWT_ISSUER` | No | `send-time-optimization` | JWT token issuer |
| `JWT_AUDIENCE` | No | `sfmc-journey-builder` | JWT token audience |

### CORS Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALLOWED_ORIGINS` | No | SFMC domains | Comma-separated list of allowed CORS origins |

### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_WINDOW` | No | `900000` | Rate limit window in milliseconds (15 minutes) |
| `RATE_LIMIT_MAX` | No | `1000` | Maximum requests per window |

### Content Security Policy

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CSP_REPORT_ONLY` | No | `false` | Enable CSP report-only mode for testing |

## SFMC Integration

### Journey Builder Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_EXTENSION_KEY` | Yes | - | SFMC App Extension Key for Journey Builder |

### SFMC API Credentials

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SFMC_CLIENT_ID` | Yes | - | SFMC API Client ID |
| `SFMC_CLIENT_SECRET` | Yes | - | SFMC API Client Secret |
| `SFMC_SUBDOMAIN` | Yes | - | SFMC subdomain (e.g., mc123456789) |
| `SFMC_ACCOUNT_ID` | Yes | - | SFMC Account ID |

### SFMC API URLs

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SFMC_AUTH_URL` | Yes | - | SFMC authentication URL |
| `SFMC_REST_BASE_URL` | Yes | - | SFMC REST API base URL |

### SFMC API Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SFMC_API_TIMEOUT` | No | `30000` | SFMC API request timeout in milliseconds |
| `SFMC_API_RETRIES` | No | `3` | Number of retry attempts for SFMC API calls |
| `SFMC_API_RETRY_DELAY` | No | `1000` | Delay between retry attempts in milliseconds |
| `SFMC_RATE_LIMIT_REQUESTS` | No | `2500` | SFMC API rate limit requests per window |
| `SFMC_RATE_LIMIT_WINDOW` | No | `60000` | SFMC API rate limit window in milliseconds |

### Data Extension Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DE_EXTERNAL_KEY` | No | - | Default data extension external key |
| `DE_NAME` | No | - | Default data extension name |

## Send Time Optimization Settings

### Core STO Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STO_DEFAULT_TIMEZONE` | No | `America/Chicago` | Default timezone for send time calculations |
| `STO_MAX_PROCESSING_TIME` | No | `20000` | Maximum processing time per contact in milliseconds |
| `STO_BATCH_SIZE` | No | `100` | Maximum batch size for contact processing |

### Time Window Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STO_MIN_TIME_WINDOWS` | No | `1` | Minimum number of time windows required |
| `STO_MAX_TIME_WINDOWS` | No | `24` | Maximum number of time windows allowed |
| `STO_DEFAULT_TIME_WINDOWS` | No | See below | Default time windows configuration (JSON) |

**Default Time Windows JSON:**
```json
[
  {"startHour":9,"endHour":10,"enabled":true},
  {"startHour":10,"endHour":11,"enabled":true},
  {"startHour":14,"endHour":15,"enabled":true}
]
```

### Timezone Support

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STO_SUPPORTED_COUNTRIES` | No | See below | Comma-separated list of supported country codes |
| `STO_FALLBACK_COUNTRY` | No | `US` | Fallback country code for unsupported countries |

**Default Supported Countries:**
`US,CA,GB,AU,DE,FR,IT,ES,BR,MX,JP,CN,IN,RU,ZA`

### Retry Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STO_MAX_RETRIES` | No | `3` | Maximum retry attempts for failed operations |
| `STO_RETRY_DELAY` | No | `1000` | Delay between retry attempts in milliseconds |

## External Services

### Holiday API Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STO_HOLIDAY_API_URL` | No | `https://date.nager.at/api/v3` | Holiday API base URL |
| `STO_HOLIDAY_API_ENABLED` | No | `true` | Enable holiday API integration |
| `HOLIDAY_API_TIMEOUT` | No | `10000` | Holiday API request timeout in milliseconds |
| `HOLIDAY_API_RETRIES` | No | `2` | Number of retry attempts for holiday API |
| `HOLIDAY_API_RETRY_DELAY` | No | `2000` | Delay between holiday API retries |

### Holiday API Fallback

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HOLIDAY_API_FALLBACK_ENABLED` | No | `true` | Enable fallback to local holiday data |
| `HOLIDAY_FALLBACK_DATA_PATH` | No | `./data/holidays` | Path to local holiday data files |

## Performance and Caching

### Cache Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STO_CACHE_TIMEOUT` | No | `3600` | General cache timeout in seconds |

### Holiday Cache

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HOLIDAY_CACHE_TTL` | No | `86400` | Holiday cache TTL in seconds (24 hours) |
| `HOLIDAY_CACHE_MAX_KEYS` | No | `1000` | Maximum number of holiday cache keys |
| `HOLIDAY_CACHE_CHECK_PERIOD` | No | `600` | Cache cleanup check period in seconds |

### Timezone Cache

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIMEZONE_CACHE_TTL` | No | `3600` | Timezone cache TTL in seconds |
| `TIMEZONE_CACHE_MAX_KEYS` | No | `500` | Maximum number of timezone cache keys |

### Token Cache

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOKEN_CACHE_TTL` | No | `3300` | Token cache TTL in seconds (55 minutes) |

### HTTP Performance

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HTTP_MAX_SOCKETS` | No | `50` | Maximum HTTP sockets |
| `HTTP_MAX_FREE_SOCKETS` | No | `10` | Maximum free HTTP sockets |
| `HTTP_TIMEOUT` | No | `30000` | HTTP request timeout in milliseconds |
| `HTTP_KEEP_ALIVE_MS` | No | `1000` | HTTP keep-alive timeout in milliseconds |

## Logging Configuration

### Log Levels and Format

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Logging level (error, warn, info, debug) |
| `LOG_FORMAT` | No | `json` | Log format (json, simple) |

### File Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FILE_LOGGING_ENABLED` | No | `true` | Enable file logging |
| `LOG_FILE_PATH` | No | `/var/log/sto-activity` | Path for log files |
| `LOG_MAX_SIZE` | No | `100MB` | Maximum log file size |
| `LOG_MAX_FILES` | No | `10` | Maximum number of log files to keep |

### Console Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONSOLE_LOGGING_ENABLED` | No | `true` | Enable console logging |

### External Logging Services

#### Datadog

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATADOG_ENABLED` | No | `false` | Enable Datadog integration |
| `DATADOG_API_KEY` | Conditional | - | Datadog API key (required if enabled) |

#### New Relic

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEW_RELIC_ENABLED` | No | `false` | Enable New Relic integration |
| `NEW_RELIC_LICENSE_KEY` | Conditional | - | New Relic license key (required if enabled) |
| `NEW_RELIC_APP_NAME` | No | `STO Activity` | New Relic application name |

## Monitoring and Alerting

### Health Check Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEALTH_CHECK_INTERVAL` | No | `30000` | Health check interval in milliseconds |
| `HEALTH_CHECK_TIMEOUT` | No | `5000` | Health check timeout in milliseconds |

### Health Thresholds

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEALTH_RESPONSE_TIME_THRESHOLD` | No | `5000` | Response time threshold in milliseconds |
| `HEALTH_ERROR_RATE_THRESHOLD` | No | `0.05` | Error rate threshold (5%) |
| `HEALTH_MEMORY_THRESHOLD` | No | `0.85` | Memory usage threshold (85%) |
| `HEALTH_CPU_THRESHOLD` | No | `0.80` | CPU usage threshold (80%) |

### Metrics Collection

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `METRICS_INTERVAL` | No | `60000` | Metrics collection interval in milliseconds |
| `METRICS_RETENTION` | No | `86400000` | Metrics retention period in milliseconds |

### Prometheus

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROMETHEUS_ENABLED` | No | `true` | Enable Prometheus metrics endpoint |

### Alerting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALERT_EVALUATION_INTERVAL` | No | `30000` | Alert evaluation interval in milliseconds |

#### Email Alerts

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_ALERTS_ENABLED` | No | `false` | Enable email alerts |
| `SMTP_HOST` | Conditional | - | SMTP server host (required if email alerts enabled) |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_SECURE` | No | `true` | Use secure SMTP connection |
| `SMTP_USER` | Conditional | - | SMTP username (required if email alerts enabled) |
| `SMTP_PASS` | Conditional | - | SMTP password (required if email alerts enabled) |
| `ALERT_EMAIL_RECIPIENTS` | Conditional | - | Comma-separated list of alert email recipients |

#### Webhook Alerts

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBHOOK_ALERTS_ENABLED` | No | `false` | Enable webhook alerts |
| `ALERT_WEBHOOK_URL` | Conditional | - | Webhook URL for alerts (required if enabled) |
| `WEBHOOK_TIMEOUT` | No | `5000` | Webhook timeout in milliseconds |

#### Slack Alerts

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLACK_ALERTS_ENABLED` | No | `false` | Enable Slack alerts |
| `SLACK_WEBHOOK_URL` | Conditional | - | Slack webhook URL (required if enabled) |
| `SLACK_CHANNEL` | No | `#alerts` | Slack channel for alerts |

## Database Configuration

### PostgreSQL (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_ENABLED` | No | `false` | Enable PostgreSQL database |
| `POSTGRES_HOST` | Conditional | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | No | `5432` | PostgreSQL port |
| `POSTGRES_DB` | Conditional | - | PostgreSQL database name |
| `POSTGRES_USER` | Conditional | - | PostgreSQL username |
| `POSTGRES_PASSWORD` | Conditional | - | PostgreSQL password |
| `POSTGRES_SSL` | No | `true` | Enable SSL for PostgreSQL connection |

#### PostgreSQL Connection Pool

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTGRES_POOL_MIN` | No | `2` | Minimum pool connections |
| `POSTGRES_POOL_MAX` | No | `10` | Maximum pool connections |
| `POSTGRES_POOL_ACQUIRE` | No | `30000` | Connection acquire timeout in milliseconds |
| `POSTGRES_POOL_IDLE` | No | `10000` | Connection idle timeout in milliseconds |

### Redis (Optional)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_ENABLED` | No | `false` | Enable Redis caching |
| `REDIS_HOST` | Conditional | `localhost` | Redis host |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | - | Redis password |
| `REDIS_DB` | No | `0` | Redis database number |
| `REDIS_CONNECT_TIMEOUT` | No | `10000` | Redis connection timeout in milliseconds |

#### Redis Cluster

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_CLUSTER_ENABLED` | No | `false` | Enable Redis cluster mode |
| `REDIS_CLUSTER_NODES` | Conditional | - | Comma-separated list of Redis cluster nodes |

## Feature Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FEATURE_BATCH_PROCESSING` | No | `true` | Enable batch processing functionality |
| `FEATURE_ADVANCED_MONITORING` | No | `true` | Enable advanced monitoring features |
| `FEATURE_HOLIDAY_API` | No | `true` | Enable holiday API integration |
| `FEATURE_PERFORMANCE_OPTS` | No | `true` | Enable performance optimizations |

## Deployment Settings

### Container Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONTAINER_MEMORY_LIMIT` | No | `512MB` | Container memory limit |
| `CONTAINER_CPU_LIMIT` | No | `1000m` | Container CPU limit |

### Health Check

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEALTH_CHECK_PATH` | No | `/health` | Health check endpoint path |
| `HEALTH_CHECK_GRACE_PERIOD` | No | `30` | Health check grace period in seconds |

### Auto-scaling

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MIN_INSTANCES` | No | `2` | Minimum number of instances |
| `MAX_INSTANCES` | No | `10` | Maximum number of instances |
| `TARGET_CPU_UTILIZATION` | No | `70` | Target CPU utilization percentage |
| `TARGET_MEMORY_UTILIZATION` | No | `80` | Target memory utilization percentage |

### Backup and Recovery

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKUP_ENABLED` | No | `false` | Enable automated backups |
| `BACKUP_SCHEDULE` | No | `0 2 * * *` | Backup schedule (cron format) |
| `BACKUP_RETENTION_DAYS` | No | `30` | Backup retention period in days |
| `BACKUP_STORAGE_PATH` | No | `/backups/sto-activity` | Backup storage path |

### Compliance and Audit

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AUDIT_LOGGING_ENABLED` | No | `true` | Enable audit logging |
| `AUDIT_LOG_RETENTION_DAYS` | No | `90` | Audit log retention period in days |
| `DATA_RETENTION_DAYS` | No | `365` | Data retention period in days |
| `METRICS_RETENTION_DAYS` | No | `30` | Metrics retention period in days |
| `LOG_RETENTION_DAYS` | No | `90` | Log retention period in days |

## Environment-Specific Examples

### Development Environment

```bash
NODE_ENV=development
PORT=3000
SSL_ENABLED=false
LOG_LEVEL=debug
CONSOLE_LOGGING_ENABLED=true
FILE_LOGGING_ENABLED=false
PROMETHEUS_ENABLED=false
```

### Staging Environment

```bash
NODE_ENV=staging
PORT=443
SSL_ENABLED=true
LOG_LEVEL=info
FILE_LOGGING_ENABLED=true
PROMETHEUS_ENABLED=true
EMAIL_ALERTS_ENABLED=false
```

### Production Environment

```bash
NODE_ENV=production
PORT=443
SSL_ENABLED=true
LOG_LEVEL=warn
FILE_LOGGING_ENABLED=true
PROMETHEUS_ENABLED=true
EMAIL_ALERTS_ENABLED=true
DATADOG_ENABLED=true
REDIS_ENABLED=true
```

## Validation and Testing

### Environment Validation Script

Create a script to validate your environment configuration:

```bash
#!/bin/bash
# validate-env.sh

echo "Validating environment configuration..."

# Check required variables
required_vars=(
  "JWT_SECRET"
  "SFMC_CLIENT_ID"
  "SFMC_CLIENT_SECRET"
  "SFMC_SUBDOMAIN"
  "SFMC_ACCOUNT_ID"
  "APP_EXTENSION_KEY"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "ERROR: Required variable $var is not set"
    exit 1
  fi
done

# Validate JWT secret length
if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "ERROR: JWT_SECRET must be at least 32 characters long"
  exit 1
fi

# Validate SSL configuration
if [ "$SSL_ENABLED" = "true" ]; then
  if [ ! -f "$SSL_KEY_PATH" ] || [ ! -f "$SSL_CERT_PATH" ]; then
    echo "ERROR: SSL enabled but certificate files not found"
    exit 1
  fi
fi

echo "Environment configuration is valid!"
```

### Configuration Testing

```bash
# Test configuration loading
node -e "
require('dotenv').config();
const config = require('./config/production');
console.log('Configuration loaded successfully');
console.log('Environment:', config.environment.name);
console.log('Features:', config.environment.features);
"

# Test SFMC connectivity
curl -X POST "${SFMC_AUTH_URL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"client_credentials\",
    \"client_id\": \"${SFMC_CLIENT_ID}\",
    \"client_secret\": \"${SFMC_CLIENT_SECRET}\"
  }"
```

This comprehensive guide covers all environment variables used by the Send Time Optimization Activity. Ensure all required variables are properly configured for your deployment environment.