# Send Time Optimization Activity - Complete Deployment Guide

This comprehensive guide provides step-by-step instructions for deploying the Send Time Optimization (STO) Custom Journey Activity to production environments. This guide consolidates all deployment information and provides detailed procedures for successful production deployment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Planning](#pre-deployment-planning)
3. [Environment Setup](#environment-setup)
4. [Configuration](#configuration)
5. [Deployment Methods](#deployment-methods)
6. [SSL/TLS Setup](#ssltls-setup)
7. [Monitoring Setup](#monitoring-setup)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Production Hardening](#production-hardening)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance and Operations](#maintenance-and-operations)
12. [Disaster Recovery](#disaster-recovery)

## Pre-Deployment Planning

### Deployment Architecture Decision

Before beginning deployment, decide on your deployment architecture:

#### Option 1: Single Server Deployment
- **Best for**: Small to medium deployments, development/staging
- **Requirements**: 1 server with 2GB RAM, 2 vCPUs
- **Pros**: Simple setup, lower cost
- **Cons**: Single point of failure, limited scalability

#### Option 2: Load Balanced Deployment
- **Best for**: High availability production environments
- **Requirements**: 2+ servers, load balancer, shared storage
- **Pros**: High availability, horizontal scaling
- **Cons**: More complex setup, higher cost

#### Option 3: Container Deployment
- **Best for**: Cloud-native environments, microservices
- **Requirements**: Container orchestration (Docker, Kubernetes)
- **Pros**: Easy scaling, consistent environments
- **Cons**: Container expertise required

### Infrastructure Planning

#### Network Requirements
```bash
# Required ports
443/tcp  # HTTPS (primary)
80/tcp   # HTTP (redirect to HTTPS)
22/tcp   # SSH (management)

# Optional ports
3000/tcp # Application port (if not using SSL termination)
9090/tcp # Prometheus metrics (internal monitoring)
6379/tcp # Redis (if using external Redis)
5432/tcp # PostgreSQL (if using external database)
```

#### DNS Configuration
```bash
# Primary domain
your-sto-activity.yourdomain.com

# Optional subdomains
api.your-sto-activity.yourdomain.com    # API endpoint
monitor.your-sto-activity.yourdomain.com # Monitoring dashboard
```

#### SSL Certificate Planning
- **Domain Validation**: Basic SSL certificate
- **Organization Validation**: Enhanced validation for business
- **Extended Validation**: Highest level of validation
- **Wildcard**: Covers all subdomains (*.yourdomain.com)

### Capacity Planning

#### Expected Load Calculation
```bash
# Calculate expected requests per second
# Example: 10,000 contacts per hour = ~3 RPS
CONTACTS_PER_HOUR=10000
EXPECTED_RPS=$((CONTACTS_PER_HOUR / 3600))

# Resource requirements scale with load
# Base: 512MB RAM, 1 vCPU for up to 5 RPS
# Scale: +256MB RAM, +0.5 vCPU per additional 5 RPS
```

#### Storage Requirements
```bash
# Application files: ~100MB
# Logs (30 days): ~1GB per 1000 RPS
# Cache data: ~50MB per 1000 supported countries
# SSL certificates: ~10MB
# Backups: 2x application size

# Total storage recommendation: 10GB minimum
```

## Prerequisites

### System Requirements

- **Node.js**: Version 18.x or higher
- **Memory**: Minimum 512MB RAM, recommended 1GB+
- **CPU**: Minimum 1 vCPU, recommended 2+ vCPUs
- **Storage**: Minimum 2GB free space
- **Network**: HTTPS access required for SFMC integration

### Required Accounts and Services

- **Salesforce Marketing Cloud**: Active account with Journey Builder
- **SSL Certificate**: Valid SSL certificate for HTTPS
- **Domain**: Registered domain name for the application
- **Optional**: Redis instance for caching
- **Optional**: PostgreSQL database for audit logging

### Development Tools

- **Docker**: Version 20.x+ (for containerized deployment)
- **Docker Compose**: Version 2.x+
- **Git**: For source code management
- **curl**: For health checks and testing

## Environment Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd send-time-optimization
```

### 2. Install Dependencies

```bash
# Install production dependencies
npm ci --only=production

# Or install all dependencies for development
npm install
```

### 3. Create Environment Configuration

```bash
# Copy the production environment template
cp .env.production .env

# Edit the environment file with your configuration
nano .env
```

## Configuration

### Environment Variables

The application requires several environment variables to be configured. Below are the critical settings:

#### Core Application Settings

```bash
# Environment
NODE_ENV=production
PORT=443
HOST=0.0.0.0

# SSL Configuration
SSL_ENABLED=true
SSL_KEY_PATH=/path/to/your/private.key
SSL_CERT_PATH=/path/to/your/certificate.crt
SSL_CA_PATH=/path/to/your/ca-bundle.crt
```

#### SFMC Integration

```bash
# JWT Configuration
JWT_SECRET=your-strong-jwt-secret-here
APP_EXTENSION_KEY=your-app-extension-key

# SFMC API Credentials
SFMC_CLIENT_ID=your-client-id
SFMC_CLIENT_SECRET=your-client-secret
SFMC_SUBDOMAIN=your-subdomain
SFMC_ACCOUNT_ID=your-account-id

# SFMC API URLs
SFMC_AUTH_URL=https://your-subdomain.auth.marketingcloudapis.com/v2/token
SFMC_REST_BASE_URL=https://your-subdomain.rest.marketingcloudapis.com
```

#### Send Time Optimization Settings

```bash
# Core STO Configuration
STO_DEFAULT_TIMEZONE=America/Chicago
STO_HOLIDAY_API_URL=https://date.nager.at/api/v3
STO_HOLIDAY_API_ENABLED=true
STO_CACHE_TIMEOUT=3600

# Performance Settings
STO_MAX_RETRIES=3
STO_RETRY_DELAY=1000
STO_MAX_PROCESSING_TIME=20000
```

#### Security Settings

```bash
# CORS Configuration
ALLOWED_ORIGINS=https://*.marketingcloudapis.com,https://*.exacttarget.com

# Rate Limiting
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=1000
```

### Configuration Validation

Before deployment, validate your configuration:

```bash
# Check environment variables
node -e "require('dotenv').config(); console.log('Environment loaded successfully');"

# Validate SFMC connectivity (requires valid credentials)
npm run health-check
```

## Deployment Methods

### Method 1: Direct Node.js Deployment

#### 1. Prepare the Server

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2
```

#### 2. Deploy the Application

```bash
# Create application directory
sudo mkdir -p /opt/sto-activity
sudo chown $USER:$USER /opt/sto-activity

# Copy application files
cp -r * /opt/sto-activity/
cd /opt/sto-activity

# Install dependencies
npm ci --only=production

# Create log directory
sudo mkdir -p /var/log/sto-activity
sudo chown $USER:$USER /var/log/sto-activity
```

#### 3. Configure PM2

Create a PM2 ecosystem file:

```bash
# Create ecosystem.config.js
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'sto-activity',
    script: 'server-production.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/sto-activity/error.log',
    out_file: '/var/log/sto-activity/out.log',
    log_file: '/var/log/sto-activity/combined.log',
    time: true,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512'
  }]
};
EOF
```

#### 4. Start the Application

```bash
# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Method 2: Docker Deployment

#### 1. Build the Docker Image

```bash
# Build the production image
docker build -t sto-activity:latest .

# Or use the npm script
npm run docker:build
```

#### 2. Configure Docker Compose

Edit `docker-compose.production.yml` with your specific configuration:

```yaml
# Update environment variables
env_file:
  - .env

# Update volume mounts for SSL certificates
volumes:
  - ./ssl:/app/ssl:ro
  - ./logs:/var/log/sto-activity
```

#### 3. Deploy with Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.production.yml up -d

# Or use the npm script
npm run docker:run

# Check service status
docker-compose -f docker-compose.production.yml ps
```

### Method 3: Cloud Platform Deployment

#### Heroku Deployment

1. **Prepare Heroku App**

```bash
# Install Heroku CLI
# Create new app
heroku create your-sto-activity-app

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-jwt-secret
heroku config:set SFMC_CLIENT_ID=your-client-id
# ... set all required environment variables
```

2. **Deploy**

```bash
# Deploy to Heroku
git push heroku main

# Scale the application
heroku ps:scale web=2
```

#### AWS Elastic Beanstalk

1. **Prepare Application**

```bash
# Install EB CLI
pip install awsebcli

# Initialize EB application
eb init sto-activity

# Create environment
eb create production
```

2. **Configure Environment**

```bash
# Set environment variables
eb setenv NODE_ENV=production JWT_SECRET=your-jwt-secret

# Deploy
eb deploy
```

## SSL/TLS Setup

### 1. Obtain SSL Certificate

#### Option A: Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt install certbot

# Obtain certificate
sudo certbot certonly --standalone -d your-domain.com

# Certificate files will be in:
# /etc/letsencrypt/live/your-domain.com/privkey.pem
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
```

#### Option B: Commercial Certificate

Purchase an SSL certificate from a trusted CA and obtain:
- Private key file (`.key`)
- Certificate file (`.crt`)
- CA bundle file (`.crt`)

### 2. Configure SSL in Application

Update your `.env` file:

```bash
SSL_ENABLED=true
SSL_KEY_PATH=/path/to/privkey.pem
SSL_CERT_PATH=/path/to/fullchain.pem
SSL_CA_PATH=/path/to/ca-bundle.crt
```

### 3. Setup Certificate Auto-Renewal (Let's Encrypt)

```bash
# Add cron job for auto-renewal
sudo crontab -e

# Add this line:
0 12 * * * /usr/bin/certbot renew --quiet --post-hook "pm2 restart sto-activity"
```

## Monitoring Setup

### 1. Application Monitoring

The application includes built-in monitoring endpoints:

- **Health Check**: `GET /health`
- **Detailed Health**: `GET /health/detailed`
- **Metrics**: `GET /metrics` (Prometheus format)
- **Performance**: `GET /performance`

### 2. External Monitoring Services

#### Datadog Integration

```bash
# Enable Datadog in environment
DATADOG_ENABLED=true
DATADOG_API_KEY=your-datadog-api-key
```

#### New Relic Integration

```bash
# Enable New Relic
NEW_RELIC_ENABLED=true
NEW_RELIC_LICENSE_KEY=your-license-key
NEW_RELIC_APP_NAME=STO Activity
```

### 3. Log Monitoring

Configure log aggregation:

```bash
# File logging
FILE_LOGGING_ENABLED=true
LOG_FILE_PATH=/var/log/sto-activity
LOG_MAX_SIZE=100MB
LOG_MAX_FILES=10
```

### 4. Alerting Setup

Configure alert channels:

```bash
# Email alerts
EMAIL_ALERTS_ENABLED=true
SMTP_HOST=smtp.your-provider.com
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
ALERT_EMAIL_RECIPIENTS=admin@yourcompany.com

# Slack alerts
SLACK_ALERTS_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_CHANNEL=#alerts
```

## Post-Deployment Verification

### 1. Health Check Verification

```bash
# Basic health check
curl -f https://your-domain.com/health

# Detailed health check
curl -s https://your-domain.com/health/detailed | jq '.'

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "Send Time Optimization Activity",
  "uptime": "00:05:30",
  "components": {
    "timezone-engine": { "status": "healthy" },
    "contact-processor": { "status": "healthy" },
    "holiday-api": { "status": "healthy" }
  }
}
```

### 2. SFMC Integration Test

```bash
# Test SFMC connectivity (requires valid JWT)
curl -X POST https://your-domain.com/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "activityObjectID": "test-activity",
    "arguments": {
      "execute": {
        "inArguments": [],
        "outArguments": []
      }
    }
  }'
```

### 3. Performance Testing

```bash
# Load test with Apache Bench
ab -n 100 -c 10 https://your-domain.com/health

# Expected results:
# - Response time < 500ms
# - 0% failed requests
# - Consistent performance
```

### 4. Security Verification

```bash
# SSL/TLS test
curl -I https://your-domain.com/health

# Check security headers
curl -I https://your-domain.com/ | grep -E "(Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options)"

# Rate limiting test
for i in {1..20}; do curl -s -o /dev/null -w "%{http_code}\n" https://your-domain.com/health; done
```

## Troubleshooting

### Common Issues

#### 1. SSL Certificate Issues

**Problem**: SSL handshake failures

**Solution**:
```bash
# Check certificate validity
openssl x509 -in /path/to/certificate.crt -text -noout

# Verify certificate chain
openssl verify -CAfile /path/to/ca-bundle.crt /path/to/certificate.crt

# Test SSL configuration
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

#### 2. SFMC Authentication Failures

**Problem**: JWT validation errors

**Solution**:
```bash
# Verify JWT secret configuration
echo $JWT_SECRET | wc -c  # Should be > 32 characters

# Check SFMC credentials
curl -X POST https://your-subdomain.auth.marketingcloudapis.com/v2/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

#### 3. High Memory Usage

**Problem**: Application consuming too much memory

**Solution**:
```bash
# Monitor memory usage
pm2 monit

# Restart application if needed
pm2 restart sto-activity

# Adjust memory limits in ecosystem.config.js
max_memory_restart: '256M'
```

#### 4. Holiday API Failures

**Problem**: Holiday API timeouts or failures

**Solution**:
```bash
# Test holiday API directly
curl -f "https://date.nager.at/api/v3/PublicHolidays/2024/US"

# Enable fallback mode
HOLIDAY_API_FALLBACK_ENABLED=true

# Check application logs
pm2 logs sto-activity --lines 100
```

### Log Analysis

#### Application Logs

```bash
# View real-time logs
pm2 logs sto-activity --lines 50 -f

# Search for errors
grep -i error /var/log/sto-activity/*.log

# Monitor specific operations
grep "Contact processing" /var/log/sto-activity/*.log | tail -20
```

#### System Logs

```bash
# Check system resources
top -p $(pgrep -f "sto-activity")

# Monitor disk space
df -h /var/log/sto-activity

# Check network connectivity
netstat -tlnp | grep :443
```

### Performance Optimization

#### 1. Enable Caching

```bash
# Redis caching
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Holiday cache optimization
HOLIDAY_CACHE_TTL=86400  # 24 hours
HOLIDAY_CACHE_MAX_KEYS=1000
```

#### 2. Optimize Resource Usage

```bash
# Adjust Node.js memory limits
node --max-old-space-size=512 server-production.js

# Enable compression
COMPRESSION_ENABLED=true
COMPRESSION_LEVEL=6
```

#### 3. Database Optimization (if using PostgreSQL)

```bash
# Connection pooling
POSTGRES_POOL_MIN=2
POSTGRES_POOL_MAX=10

# Query optimization
POSTGRES_POOL_ACQUIRE=30000
POSTGRES_POOL_IDLE=10000
```

## Maintenance

### Regular Maintenance Tasks

#### 1. Log Rotation

```bash
# Setup logrotate for application logs
sudo cat > /etc/logrotate.d/sto-activity << EOF
/var/log/sto-activity/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

#### 2. Security Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Node.js dependencies
npm audit
npm audit fix

# Update Docker images
docker pull node:18-alpine
npm run docker:build
```

#### 3. Performance Monitoring

```bash
# Weekly performance report
curl -s https://your-domain.com/performance | jq '.'

# Monitor resource usage
pm2 monit

# Check application metrics
curl -s https://your-domain.com/metrics
```

#### 4. Backup Procedures

```bash
# Backup configuration files
tar -czf sto-backup-$(date +%Y%m%d).tar.gz \
  .env \
  config/ \
  ssl/ \
  ecosystem.config.js

# Backup logs (if needed)
tar -czf logs-backup-$(date +%Y%m%d).tar.gz /var/log/sto-activity/

# Store backups securely
aws s3 cp sto-backup-$(date +%Y%m%d).tar.gz s3://your-backup-bucket/
```

### Scaling Considerations

#### Horizontal Scaling

```bash
# Increase PM2 instances
pm2 scale sto-activity +2

# Load balancer configuration (Nginx example)
upstream sto_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
```

#### Vertical Scaling

```bash
# Increase memory limits
max_memory_restart: '1G'

# Adjust CPU allocation
instances: 4  # Match CPU cores
```

### Disaster Recovery

#### 1. Backup Strategy

- **Configuration**: Daily backup of environment files
- **Logs**: Weekly backup of application logs
- **SSL Certificates**: Secure backup of certificates
- **Database**: Daily backup if using PostgreSQL

#### 2. Recovery Procedures

```bash
# Quick recovery steps
1. Restore configuration files
2. Reinstall dependencies: npm ci --only=production
3. Restore SSL certificates
4. Start application: pm2 start ecosystem.config.js
5. Verify health: curl -f https://your-domain.com/health
```

#### 3. Monitoring and Alerting

- Set up monitoring for all critical components
- Configure alerts for downtime, high error rates, and performance issues
- Establish escalation procedures for critical alerts
- Regular testing of alert systems

## Production Hardening

### Security Hardening

#### 1. System-Level Security
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Configure fail2ban
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

#### 2. Application Security
```bash
# Set secure file permissions
chmod 600 .env
chmod 700 ssl/
chmod 755 scripts/
chmod 644 *.js *.json *.md

# Create dedicated user
sudo useradd -r -s /bin/false sto-activity
sudo chown -R sto-activity:sto-activity /opt/sto-activity
```

#### 3. Network Security
```bash
# Configure reverse proxy (Nginx example)
sudo apt install nginx -y

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/sto-activity << EOF
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/sto-activity /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Performance Optimization

#### 1. System Optimization
```bash
# Increase file descriptor limits
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Optimize kernel parameters
sudo tee -a /etc/sysctl.conf << EOF
net.core.somaxconn = 65536
net.ipv4.tcp_max_syn_backlog = 65536
net.ipv4.tcp_fin_timeout = 30
net.ipv4.tcp_keepalive_time = 1200
vm.swappiness = 10
EOF

sudo sysctl -p
```

#### 2. Node.js Optimization
```bash
# PM2 ecosystem configuration for production
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'sto-activity',
    script: 'server-production.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/sto-activity/error.log',
    out_file: '/var/log/sto-activity/out.log',
    log_file: '/var/log/sto-activity/combined.log',
    time: true,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512 --optimize-for-size',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
EOF
```

### Backup and Recovery Setup

#### 1. Automated Backup Configuration
```bash
# Create backup script
sudo tee /usr/local/bin/sto-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/sto-activity"
DATE=$(date +%Y%m%d-%H%M%S)
APP_DIR="/opt/sto-activity"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup application files
tar -czf "$BACKUP_DIR/app-$DATE.tar.gz" \
  -C "$APP_DIR" \
  --exclude=node_modules \
  --exclude=logs \
  --exclude=.git \
  .

# Backup configuration
tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" \
  "$APP_DIR/.env" \
  "$APP_DIR/ecosystem.config.js" \
  /etc/nginx/sites-available/sto-activity

# Backup SSL certificates
tar -czf "$BACKUP_DIR/ssl-$DATE.tar.gz" \
  "$APP_DIR/ssl/"

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /usr/local/bin/sto-backup.sh

# Schedule daily backups
echo "0 2 * * * /usr/local/bin/sto-backup.sh" | sudo crontab -
```

#### 2. Recovery Procedures
```bash
# Create recovery script
sudo tee /usr/local/bin/sto-recover.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/sto-activity"
APP_DIR="/opt/sto-activity"

if [ -z "$1" ]; then
  echo "Usage: $0 <backup-date>"
  echo "Available backups:"
  ls -la "$BACKUP_DIR"/app-*.tar.gz | awk '{print $9}' | sed 's/.*app-\(.*\)\.tar\.gz/\1/'
  exit 1
fi

DATE="$1"

# Stop application
pm2 stop sto-activity

# Backup current state
mv "$APP_DIR" "$APP_DIR.backup.$(date +%Y%m%d-%H%M%S)"

# Restore application
mkdir -p "$APP_DIR"
tar -xzf "$BACKUP_DIR/app-$DATE.tar.gz" -C "$APP_DIR"

# Restore configuration
tar -xzf "$BACKUP_DIR/config-$DATE.tar.gz" -C /

# Restore SSL certificates
tar -xzf "$BACKUP_DIR/ssl-$DATE.tar.gz" -C "$APP_DIR"

# Install dependencies
cd "$APP_DIR"
npm ci --only=production

# Start application
pm2 start ecosystem.config.js

echo "Recovery completed from backup: $DATE"
EOF

sudo chmod +x /usr/local/bin/sto-recover.sh
```

## Disaster Recovery

### Disaster Recovery Plan

#### 1. Recovery Time Objectives (RTO)
- **Critical**: 15 minutes (application restart)
- **Major**: 1 hour (server rebuild)
- **Disaster**: 4 hours (complete infrastructure rebuild)

#### 2. Recovery Point Objectives (RPO)
- **Configuration**: 24 hours (daily backups)
- **Logs**: 1 hour (real-time replication)
- **Application state**: Real-time (stateless application)

#### 3. Disaster Scenarios and Procedures

**Scenario 1: Application Failure**
```bash
# 1. Immediate response
pm2 restart sto-activity

# 2. If restart fails
pm2 stop sto-activity
pm2 start ecosystem.config.js

# 3. If still failing
cd /opt/sto-activity
npm ci --only=production
pm2 restart sto-activity

# 4. Verify recovery
curl -f https://your-domain.com/health
```

**Scenario 2: Server Failure**
```bash
# 1. Provision new server
# 2. Install prerequisites (Node.js, PM2, etc.)
# 3. Restore from backup
/usr/local/bin/sto-recover.sh LATEST

# 4. Update DNS if needed
# 5. Verify functionality
```

**Scenario 3: Complete Infrastructure Loss**
```bash
# 1. Provision new infrastructure
# 2. Restore DNS configuration
# 3. Restore SSL certificates
# 4. Deploy application from source control
# 5. Restore configuration from backup
# 6. Verify all integrations
```

### Business Continuity

#### 1. Communication Plan
```bash
# Stakeholder notification template
INCIDENT_ID="INC-$(date +%Y%m%d-%H%M)"
SEVERITY="[HIGH/MEDIUM/LOW]"
STATUS="[INVESTIGATING/IDENTIFIED/MONITORING/RESOLVED]"

# Notification channels
EMAIL_LIST="ops@company.com,dev@company.com"
SLACK_CHANNEL="#incidents"
STATUS_PAGE="https://status.company.com"
```

#### 2. Escalation Procedures
- **Level 1**: Operations team (0-15 minutes)
- **Level 2**: Development team (15-30 minutes)
- **Level 3**: Management team (30+ minutes)
- **Level 4**: External vendors (1+ hour)

### Maintenance and Operations

#### Regular Maintenance Schedule

**Daily Tasks**
```bash
# Health check verification
curl -f https://your-domain.com/health/detailed

# Log review
grep -i error /var/log/sto-activity/*.log | tail -10

# Resource monitoring
df -h
free -h
```

**Weekly Tasks**
```bash
# Security updates
sudo apt update && sudo apt list --upgradable

# Certificate expiry check
openssl x509 -in /path/to/certificate.crt -noout -dates

# Performance review
curl -s https://your-domain.com/performance | jq '.summary'
```

**Monthly Tasks**
```bash
# Dependency updates
npm audit
npm outdated

# Log rotation verification
ls -la /var/log/sto-activity/

# Backup verification
ls -la /backups/sto-activity/
```

**Quarterly Tasks**
```bash
# Security audit
npm audit --audit-level high

# Performance testing
# Run load tests against staging environment

# Documentation review
# Update deployment and operational documentation
```

### Monitoring and Alerting Enhancement

#### Advanced Monitoring Setup
```bash
# Install monitoring stack
git clone https://github.com/your-org/monitoring-stack
cd monitoring-stack

# Configure for STO Activity
cp sto-activity.yml.example sto-activity.yml
# Edit configuration

# Deploy monitoring
docker-compose up -d prometheus grafana alertmanager

# Import STO Activity dashboard
curl -X POST http://admin:admin@localhost:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @grafana-dashboard.json
```

#### Custom Alerts Configuration
```yaml
# alertmanager.yml
groups:
- name: sto-activity
  rules:
  - alert: STOActivityDown
    expr: up{job="sto-activity"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "STO Activity is down"
      
  - alert: STOHighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "High error rate detected"
      
  - alert: STOHighResponseTime
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 5
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High response time detected"
```

This comprehensive deployment guide provides all the necessary information for successfully deploying and maintaining the Send Time Optimization Activity in production environments. Follow the appropriate sections based on your deployment architecture and requirements, and ensure all security and monitoring measures are properly implemented.