# Send Time Optimization Activity - Troubleshooting Guide

This guide provides solutions to common issues encountered when deploying and operating the Send Time Optimization (STO) Custom Journey Activity.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
3. [Error Messages](#error-messages)
4. [Performance Issues](#performance-issues)
5. [Integration Problems](#integration-problems)
6. [Monitoring and Debugging](#monitoring-and-debugging)
7. [Recovery Procedures](#recovery-procedures)
8. [Support Information](#support-information)

## Quick Diagnostics

### Health Check Commands

```bash
# Basic health check
curl -f https://your-domain.com/health

# Detailed health status
curl -s https://your-domain.com/health/detailed | jq '.'

# Performance metrics
curl -s https://your-domain.com/performance | jq '.'

# Active alerts
curl -s https://your-domain.com/alerts | jq '.'
```

### Log Analysis

```bash
# View recent logs (PM2)
pm2 logs sto-activity --lines 50

# Search for errors
grep -i error /var/log/sto-activity/*.log | tail -20

# Monitor real-time logs
tail -f /var/log/sto-activity/sto-activity-$(date +%Y-%m-%d).log

# Docker logs
docker logs sto-activity-prod --tail 50 -f
```

### System Resource Check

```bash
# Memory usage
free -h
ps aux | grep node | head -5

# CPU usage
top -p $(pgrep -f "sto-activity")

# Disk space
df -h /var/log/sto-activity
df -h /app

# Network connectivity
netstat -tlnp | grep :443
curl -I https://date.nager.at/api/v3/PublicHolidays/2024/US
```

## Common Issues

### 1. Application Won't Start

#### Symptoms
- Server fails to start
- Port binding errors
- SSL certificate errors

#### Diagnosis
```bash
# Check if port is already in use
sudo netstat -tlnp | grep :443
sudo lsof -i :443

# Verify SSL certificates
openssl x509 -in /path/to/certificate.crt -text -noout
openssl rsa -in /path/to/private.key -check

# Check environment variables
node -e "require('dotenv').config(); console.log('JWT_SECRET length:', process.env.JWT_SECRET?.length || 0);"
```

#### Solutions

**Port Already in Use:**
```bash
# Find and kill process using the port
sudo kill -9 $(sudo lsof -t -i:443)

# Or use a different port
export PORT=3001
```

**SSL Certificate Issues:**
```bash
# Verify certificate chain
openssl verify -CAfile /path/to/ca-bundle.crt /path/to/certificate.crt

# Check certificate expiration
openssl x509 -in /path/to/certificate.crt -noout -dates

# Regenerate Let's Encrypt certificate
sudo certbot renew --force-renewal
```

**Missing Environment Variables:**
```bash
# Copy and configure environment file
cp .env.production .env
nano .env

# Validate required variables
./scripts/validate-env.sh
```

### 2. SFMC Authentication Failures

#### Symptoms
- JWT validation errors
- "Invalid JWT token" messages
- SFMC API authentication failures

#### Diagnosis
```bash
# Test SFMC API connectivity
curl -X POST "${SFMC_AUTH_URL}" \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"client_credentials\",
    \"client_id\": \"${SFMC_CLIENT_ID}\",
    \"client_secret\": \"${SFMC_CLIENT_SECRET}\"
  }"

# Verify JWT secret
echo "JWT_SECRET length: ${#JWT_SECRET}"

# Check JWT token format
echo "YOUR_JWT_TOKEN" | cut -d. -f1 | base64 -d | jq '.'
```

#### Solutions

**Invalid SFMC Credentials:**
```bash
# Verify credentials in SFMC Setup
# 1. Go to Setup > Apps > Installed Packages
# 2. Find your package and verify Client ID/Secret
# 3. Check API Integration permissions

# Update environment variables
export SFMC_CLIENT_ID="correct-client-id"
export SFMC_CLIENT_SECRET="correct-client-secret"
```

**JWT Secret Issues:**
```bash
# Generate strong JWT secret (32+ characters)
export JWT_SECRET=$(openssl rand -base64 32)

# Ensure secret matches SFMC configuration
# The JWT secret must match what's configured in SFMC
```

**Token Expiration:**
```bash
# Check token cache settings
export TOKEN_CACHE_TTL=3300  # 55 minutes

# Clear token cache
redis-cli FLUSHDB  # If using Redis
# Or restart application to clear in-memory cache
pm2 restart sto-activity
```

### 3. Holiday API Issues

#### Symptoms
- Holiday checking failures
- Timeout errors from holiday API
- Incorrect holiday data

#### Diagnosis
```bash
# Test holiday API directly
curl -f "https://date.nager.at/api/v3/PublicHolidays/2024/US"

# Check API response time
time curl -s "https://date.nager.at/api/v3/PublicHolidays/2024/US" > /dev/null

# Verify cache status
curl -s https://your-domain.com/health/detailed | jq '.components."holiday-api"'
```

#### Solutions

**API Timeouts:**
```bash
# Increase timeout settings
export HOLIDAY_API_TIMEOUT=15000
export HOLIDAY_API_RETRIES=3

# Enable fallback mode
export HOLIDAY_API_FALLBACK_ENABLED=true
```

**API Rate Limiting:**
```bash
# Implement caching
export HOLIDAY_CACHE_TTL=86400  # 24 hours

# Use alternative API
export STO_HOLIDAY_API_URL="https://api.alternative-provider.com"
```

**Incorrect Holiday Data:**
```bash
# Clear holiday cache
redis-cli DEL "holiday:*"  # If using Redis

# Or restart application
pm2 restart sto-activity

# Verify country code format
echo "Country codes should be 2-letter ISO format (e.g., US, GB, CA)"
```

### 4. High Memory Usage

#### Symptoms
- Application consuming excessive memory
- Out of memory errors
- Slow performance

#### Diagnosis
```bash
# Monitor memory usage
pm2 monit

# Check memory leaks
node --inspect server-production.js
# Then use Chrome DevTools to analyze memory

# Analyze heap usage
kill -USR2 $(pgrep -f "sto-activity")  # Generate heap snapshot
```

#### Solutions

**Memory Leaks:**
```bash
# Restart application periodically
pm2 restart sto-activity

# Adjust memory limits
# In ecosystem.config.js:
max_memory_restart: '256M'

# Optimize cache settings
export HOLIDAY_CACHE_MAX_KEYS=500
export TIMEZONE_CACHE_MAX_KEYS=250
```

**Large Cache Size:**
```bash
# Reduce cache TTL
export HOLIDAY_CACHE_TTL=3600  # 1 hour instead of 24

# Implement cache cleanup
export HOLIDAY_CACHE_CHECK_PERIOD=300  # 5 minutes
```

### 5. Performance Issues

#### Symptoms
- Slow response times
- Timeouts during contact processing
- High CPU usage

#### Diagnosis
```bash
# Check response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-domain.com/health

# Monitor CPU usage
top -p $(pgrep -f "sto-activity")

# Analyze performance metrics
curl -s https://your-domain.com/performance | jq '.summary'
```

#### Solutions

**Slow Database Queries:**
```bash
# Optimize connection pooling
export POSTGRES_POOL_MAX=20
export POSTGRES_POOL_MIN=5

# Enable query logging
export LOG_LEVEL=debug
```

**High CPU Usage:**
```bash
# Scale horizontally
pm2 scale sto-activity +2

# Optimize processing
export STO_BATCH_SIZE=50  # Reduce batch size
export STO_MAX_PROCESSING_TIME=10000  # Reduce timeout
```

**Network Latency:**
```bash
# Enable compression
export COMPRESSION_ENABLED=true

# Optimize HTTP settings
export HTTP_KEEP_ALIVE_MS=5000
export HTTP_MAX_SOCKETS=100
```

## Error Messages

### Common Error Messages and Solutions

#### "JWT validation error"
```bash
# Check JWT secret configuration
echo "JWT_SECRET: ${JWT_SECRET:0:10}..."

# Verify token format
# JWT should have 3 parts separated by dots
echo "Token format: header.payload.signature"

# Solution: Ensure JWT_SECRET matches SFMC configuration
```

#### "SFMC API authentication failed"
```bash
# Verify credentials
curl -X POST "${SFMC_AUTH_URL}" \
  -H "Content-Type: application/json" \
  -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"${SFMC_CLIENT_ID}\",\"client_secret\":\"${SFMC_CLIENT_SECRET}\"}"

# Solution: Update credentials in SFMC and environment
```

#### "Holiday API timeout"
```bash
# Test API connectivity
curl -m 10 "https://date.nager.at/api/v3/PublicHolidays/2024/US"

# Solution: Increase timeout or enable fallback
export HOLIDAY_API_TIMEOUT=15000
export HOLIDAY_API_FALLBACK_ENABLED=true
```

#### "Data extension update failed"
```bash
# Check SFMC permissions
# Ensure API integration has Data Extension read/write permissions

# Verify data extension exists
# Check external key and field names in SFMC

# Solution: Update permissions or data extension configuration
```

#### "Timezone calculation error"
```bash
# Check country code format
echo "Country code should be 2-letter ISO format"

# Verify timezone engine
curl -s https://your-domain.com/health/detailed | jq '.components."timezone-engine"'

# Solution: Use supported country codes or configure fallback
export STO_FALLBACK_COUNTRY=US
```

## Performance Issues

### Slow Response Times

#### Investigation Steps
```bash
# 1. Check system resources
htop
iotop

# 2. Analyze application metrics
curl -s https://your-domain.com/performance | jq '.metrics'

# 3. Profile application
node --prof server-production.js
# Process profile: node --prof-process isolate-*.log > profile.txt

# 4. Check database performance (if using PostgreSQL)
# Connect to database and run:
# SELECT * FROM pg_stat_activity;
# SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

#### Optimization Solutions
```bash
# Enable caching
export REDIS_ENABLED=true
export REDIS_HOST=localhost

# Optimize batch processing
export STO_BATCH_SIZE=25
export FEATURE_PERFORMANCE_OPTS=true

# Scale application
pm2 scale sto-activity 4  # Match CPU cores

# Use CDN for static assets
# Configure nginx or cloudflare for static content
```

### High Error Rates

#### Investigation
```bash
# Check error logs
grep -i error /var/log/sto-activity/*.log | tail -50

# Analyze error patterns
awk '/ERROR/ {print $0}' /var/log/sto-activity/*.log | sort | uniq -c | sort -nr

# Check alert status
curl -s https://your-domain.com/alerts | jq '.activeAlerts'
```

#### Solutions
```bash
# Increase retry attempts
export STO_MAX_RETRIES=5
export STO_RETRY_DELAY=2000

# Implement circuit breaker
export FEATURE_ADVANCED_MONITORING=true

# Add health checks
export HEALTH_CHECK_INTERVAL=15000
```

## Integration Problems

### Journey Builder Integration

#### Symptoms
- Activity not appearing in Journey Builder
- Configuration not saving
- Execution failures

#### Solutions

**Activity Registration:**
```bash
# Verify activity-config.json
cat activity-config.json | jq '.configurationArguments'

# Check HTTPS accessibility
curl -I https://your-domain.com/

# Validate endpoints
curl -X POST https://your-domain.com/save \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"test": true}'
```

**Configuration Issues:**
```bash
# Check Postmonger integration
# Open browser console in Journey Builder
# Look for JavaScript errors

# Verify CORS settings
export ALLOWED_ORIGINS="https://*.marketingcloudapis.com,https://*.exacttarget.com"
```

### Data Extension Integration

#### Symptoms
- ConvertedTime field not updating
- Permission errors
- Field mapping issues

#### Solutions

**Permission Issues:**
```bash
# Verify API permissions in SFMC:
# 1. Data Extensions: Read, Write
# 2. Contacts: Read
# 3. Journey Builder: Execute

# Check data extension configuration
curl -X GET "${SFMC_REST_BASE_URL}/data/v1/customobjectdata/key/${DE_EXTERNAL_KEY}/rowset" \
  -H "Authorization: Bearer ${SFMC_ACCESS_TOKEN}"
```

**Field Mapping:**
```bash
# Verify field names match exactly
# Common fields: SubscriberKey, ConvertedTime, Geosegment

# Check data types
# ConvertedTime should be Date/DateTime field
# Geosegment should be Text field (2 characters)
```

## Monitoring and Debugging

### Enable Debug Logging

```bash
# Temporary debug mode
export LOG_LEVEL=debug
pm2 restart sto-activity

# Monitor specific operations
tail -f /var/log/sto-activity/*.log | grep "Contact processing"

# Debug specific components
export DEBUG="sto:*"
```

### Performance Monitoring

```bash
# Application Performance Monitoring
curl -s https://your-domain.com/performance | jq '{
  requests: .requests,
  responseTime: .avgResponseTime,
  errorRate: .errorRate,
  memory: .memory
}'

# System monitoring
watch -n 5 'ps aux | grep node | head -3'

# Network monitoring
netstat -i
ss -tuln | grep :443
```

### Health Monitoring

```bash
# Comprehensive health check
curl -s https://your-domain.com/health/detailed | jq '{
  status: .status,
  uptime: .uptime,
  components: .components | keys,
  alerts: .alerts.active
}'

# Component-specific health
curl -s https://your-domain.com/health/detailed | jq '.components."timezone-engine"'
curl -s https://your-domain.com/health/detailed | jq '.components."holiday-api"'
```

## Recovery Procedures

### Application Recovery

#### Quick Recovery
```bash
# 1. Restart application
pm2 restart sto-activity

# 2. Clear caches
redis-cli FLUSHALL  # If using Redis
rm -rf /tmp/sto-cache-*  # Clear file cache

# 3. Verify health
curl -f https://your-domain.com/health
```

#### Full Recovery
```bash
# 1. Stop application
pm2 stop sto-activity

# 2. Backup current state
tar -czf sto-backup-$(date +%Y%m%d-%H%M).tar.gz \
  /opt/sto-activity \
  /var/log/sto-activity

# 3. Restore from backup
tar -xzf sto-backup-latest.tar.gz -C /

# 4. Update configuration
cp .env.production .env
nano .env

# 5. Restart application
pm2 start ecosystem.config.js

# 6. Verify functionality
npm run health-check
```

### Database Recovery (if using PostgreSQL)

```bash
# 1. Check database status
pg_isready -h $POSTGRES_HOST -p $POSTGRES_PORT

# 2. Restore from backup
pg_restore -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB backup.sql

# 3. Verify data integrity
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT COUNT(*) FROM audit_logs;"
```

### SSL Certificate Recovery

```bash
# 1. Check certificate expiration
openssl x509 -in /path/to/certificate.crt -noout -dates

# 2. Renew Let's Encrypt certificate
sudo certbot renew --force-renewal

# 3. Update certificate paths
export SSL_CERT_PATH=/etc/letsencrypt/live/your-domain.com/fullchain.pem
export SSL_KEY_PATH=/etc/letsencrypt/live/your-domain.com/privkey.pem

# 4. Restart application
pm2 restart sto-activity
```

## Support Information

### Collecting Support Information

When reporting issues, collect the following information:

```bash
#!/bin/bash
# support-info.sh

echo "=== System Information ==="
uname -a
node --version
npm --version
pm2 --version

echo "=== Application Status ==="
pm2 status
curl -s https://your-domain.com/health | jq '.'

echo "=== Recent Logs ==="
tail -50 /var/log/sto-activity/*.log

echo "=== Configuration ==="
env | grep -E "(NODE_ENV|PORT|SSL_|SFMC_|STO_)" | sort

echo "=== Resource Usage ==="
free -h
df -h
ps aux | grep node | head -5

echo "=== Network Status ==="
netstat -tlnp | grep -E ":(80|443|3000)"
```

### Log Collection

```bash
# Create support bundle
tar -czf support-bundle-$(date +%Y%m%d-%H%M).tar.gz \
  /var/log/sto-activity/*.log \
  /opt/sto-activity/.env \
  /opt/sto-activity/ecosystem.config.js \
  /opt/sto-activity/package.json

# Sanitize sensitive information
sed -i 's/JWT_SECRET=.*/JWT_SECRET=***REDACTED***/g' support-bundle-*/
sed -i 's/SFMC_CLIENT_SECRET=.*/SFMC_CLIENT_SECRET=***REDACTED***/g' support-bundle-*/
```

### Contact Information

For additional support:

1. **Documentation**: Check the deployment guide and API documentation
2. **Health Checks**: Use built-in monitoring endpoints
3. **Logs**: Enable debug logging for detailed troubleshooting
4. **Community**: Check GitHub issues and discussions
5. **Professional Support**: Contact your SFMC implementation partner

### Emergency Procedures

#### Critical System Failure
```bash
# 1. Immediate response
pm2 stop sto-activity
systemctl stop nginx  # If using nginx

# 2. Activate maintenance mode
echo "System under maintenance" > /var/www/html/maintenance.html

# 3. Notify stakeholders
# Send alerts to operations team

# 4. Begin recovery procedures
# Follow recovery procedures above

# 5. Post-incident review
# Document incident and lessons learned
```

This troubleshooting guide covers the most common issues encountered with the Send Time Optimization Activity. For issues not covered here, enable debug logging and analyze the detailed error messages to identify the root cause.