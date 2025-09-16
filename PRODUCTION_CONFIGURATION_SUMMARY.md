# Production Configuration Summary

This document provides a comprehensive overview of the production deployment configuration for the Send Time Optimization Activity.

## Configuration Files Overview

### Core Configuration Files

| File | Purpose | Description |
|------|---------|-------------|
| `.env.production` | Environment template | Template with all environment variables and documentation |
| `.env` | Active environment | Production environment variables (created from template) |
| `config/production.js` | Application config | Main production configuration module |
| `config/production-enhanced.js` | Enhanced config | Extended configuration with advanced features |
| `config/security.js` | Security config | Security middleware and validation configuration |
| `server-production.js` | Production server | Production-ready server with all enhancements |
| `docker-compose.production.yml` | Container config | Docker Compose configuration for production |
| `Dockerfile` | Container image | Multi-stage Docker build for production |

### Management Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `scripts/production-startup.sh` | Start application | `./scripts/production-startup.sh` |
| `scripts/production-shutdown.sh` | Stop application | `./scripts/production-shutdown.sh` |
| `scripts/production-restart.sh` | Restart application | `./scripts/production-restart.sh [rolling]` |
| `scripts/validate-environment.sh` | Validate config | `./scripts/validate-environment.sh` |
| `scripts/ssl-setup.sh` | SSL management | `./scripts/ssl-setup.sh [command]` |
| `scripts/manage-environment.sh` | Environment management | `./scripts/manage-environment.sh [command]` |

## Environment Variables Configuration

### Required Variables

#### SFMC Integration
```bash
SFMC_CLIENT_ID=your-client-id                    # SFMC API Client ID
SFMC_CLIENT_SECRET=your-client-secret            # SFMC API Client Secret
SFMC_SUBDOMAIN=your-subdomain                    # SFMC subdomain
SFMC_ACCOUNT_ID=your-account-id                  # SFMC Account ID
APP_EXTENSION_KEY=your-app-extension-key         # SFMC App Extension Key
```

#### Security
```bash
JWT_SECRET=your-strong-jwt-secret                # JWT secret (min 32 chars)
NODE_ENV=production                              # Environment type
```

#### Server Configuration
```bash
PORT=443                                         # Server port (443 for HTTPS)
HOST=0.0.0.0                                     # Server host
SSL_ENABLED=true                                 # Enable HTTPS
SSL_KEY_PATH=/path/to/private.key               # SSL private key path
SSL_CERT_PATH=/path/to/certificate.crt          # SSL certificate path
```

### Optional but Recommended Variables

#### Performance
```bash
STO_MAX_PROCESSING_TIME=20000                    # Max processing time (ms)
STO_BATCH_SIZE=100                               # Batch processing size
HOLIDAY_CACHE_TTL=86400                          # Holiday cache TTL (seconds)
TIMEZONE_CACHE_TTL=3600                          # Timezone cache TTL (seconds)
```

#### Monitoring
```bash
LOG_LEVEL=info                                   # Logging level
FILE_LOGGING_ENABLED=true                       # Enable file logging
PROMETHEUS_ENABLED=true                          # Enable metrics endpoint
HEALTH_CHECK_INTERVAL=30000                      # Health check interval (ms)
```

#### Security
```bash
RATE_LIMIT_WINDOW=900000                         # Rate limit window (ms)
RATE_LIMIT_MAX=1000                              # Max requests per window
ALLOWED_ORIGINS=https://*.marketingcloudapis.com # CORS allowed origins
```

## Server Configuration

### Production Server Features

#### Security Enhancements
- **SSL/TLS Support**: Full HTTPS with configurable cipher suites
- **Security Headers**: Helmet.js with comprehensive security headers
- **Rate Limiting**: Multi-tier rate limiting with endpoint-specific limits
- **CORS Protection**: Dynamic origin validation
- **Input Sanitization**: Request sanitization and validation
- **JWT Validation**: Secure token validation with configurable secrets

#### Performance Optimizations
- **Compression**: Gzip/Brotli compression with content-type optimization
- **Connection Pooling**: HTTP connection pooling and keep-alive
- **Caching**: Multi-tier caching (memory, Redis, file)
- **Timeout Management**: Configurable timeouts for different operations
- **Resource Limits**: Memory and CPU usage monitoring

#### Operational Features
- **Graceful Shutdown**: Proper cleanup on termination signals
- **Health Monitoring**: Comprehensive health checks
- **Structured Logging**: JSON logging with rotation
- **Error Handling**: Global error handling with proper responses
- **Process Management**: PM2 integration for clustering

### SSL/TLS Configuration

#### Supported Certificate Types
- **Self-signed**: For testing and development
- **Let's Encrypt**: Free automated certificates
- **Commercial**: Purchased certificates from trusted CAs

#### Security Features
- **TLS 1.2/1.3**: Modern TLS versions only
- **Strong Ciphers**: Carefully selected cipher suites
- **HSTS**: HTTP Strict Transport Security
- **Certificate Validation**: Automated expiry checking
- **Auto-renewal**: Automated Let's Encrypt renewal

## Deployment Architecture

### Deployment Options

#### 1. Direct Node.js Deployment
```bash
# Install dependencies
npm ci --only=production

# Configure environment
cp .env.production .env
# Edit .env with your configuration

# Start with PM2
pm2 start ecosystem.config.js

# Or start directly
node server-production.js
```

#### 2. Docker Deployment
```bash
# Build image
docker build -t sto-activity:latest .

# Run with Docker Compose
docker-compose -f docker-compose.production.yml up -d
```

#### 3. Cloud Platform Deployment
- **Heroku**: Git-based deployment with buildpacks
- **AWS Elastic Beanstalk**: Application deployment platform
- **Google Cloud Run**: Containerized serverless deployment
- **Azure Container Instances**: Container deployment service

### Infrastructure Requirements

#### Minimum Requirements
- **CPU**: 1 vCPU
- **Memory**: 512MB RAM
- **Storage**: 2GB disk space
- **Network**: HTTPS access required

#### Recommended Requirements
- **CPU**: 2+ vCPUs
- **Memory**: 1GB+ RAM
- **Storage**: 10GB+ disk space
- **Network**: Load balancer with SSL termination

## Security Configuration

### Security Layers

#### 1. Transport Security
- **HTTPS Only**: All traffic encrypted
- **HSTS**: Prevent protocol downgrade attacks
- **Certificate Pinning**: Optional certificate validation

#### 2. Application Security
- **JWT Validation**: Secure token-based authentication
- **Rate Limiting**: Prevent abuse and DoS attacks
- **Input Validation**: Sanitize all user inputs
- **CORS Protection**: Restrict cross-origin requests

#### 3. Infrastructure Security
- **Firewall Rules**: Restrict network access
- **File Permissions**: Secure file system permissions
- **Process Isolation**: Run as non-root user
- **Resource Limits**: Prevent resource exhaustion

### Security Headers

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
```

## Monitoring and Observability

### Health Check Endpoints

| Endpoint | Purpose | Response |
|----------|---------|----------|
| `/health` | Basic health | `{"status": "healthy"}` |
| `/health/detailed` | Detailed health | Component status details |
| `/metrics` | Prometheus metrics | Metrics in Prometheus format |
| `/performance` | Performance stats | Response times, throughput |

### Monitoring Components

#### Application Metrics
- **Response Time**: Request processing time
- **Throughput**: Requests per second
- **Error Rate**: Error percentage
- **Active Connections**: Current connections

#### Business Metrics
- **Contacts Processed**: Number of contacts processed
- **Send Time Calculations**: Calculation success rate
- **Timezone Conversions**: Conversion accuracy
- **Holiday Checks**: Holiday API success rate

#### System Metrics
- **CPU Usage**: Processor utilization
- **Memory Usage**: RAM consumption
- **Disk Usage**: Storage utilization
- **Network I/O**: Network traffic

### Alerting Rules

#### Critical Alerts
- Application down (immediate)
- Error rate > 10% (2 minutes)
- Response time > 10s (2 minutes)
- Memory usage > 90% (5 minutes)

#### Warning Alerts
- Error rate > 5% (10 minutes)
- Response time > 5s (5 minutes)
- Memory usage > 80% (10 minutes)
- Certificate expires < 30 days

## Operational Procedures

### Startup Procedure
1. Validate environment configuration
2. Check system requirements
3. Set up directories and permissions
4. Install dependencies
5. Run pre-flight checks
6. Start application
7. Verify health checks

### Shutdown Procedure
1. Stop accepting new requests
2. Complete in-flight requests
3. Close database connections
4. Flush logs and metrics
5. Clean up temporary files
6. Terminate process

### Update Procedure
1. Create backup of current configuration
2. Deploy new code
3. Update dependencies
4. Restart application
5. Verify health checks
6. Monitor for issues

### Troubleshooting

#### Common Issues

**SSL Certificate Issues**
```bash
# Check certificate validity
openssl x509 -in certificate.crt -text -noout

# Test SSL configuration
openssl s_client -connect domain.com:443
```

**SFMC Authentication Issues**
```bash
# Test SFMC connectivity
curl -X POST https://subdomain.auth.marketingcloudapis.com/v2/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"...","client_secret":"..."}'
```

**Performance Issues**
```bash
# Monitor application
pm2 monit

# Check resource usage
top -p $(pgrep -f "sto-activity")

# Analyze logs
tail -f /var/log/sto-activity/*.log
```

## Best Practices

### Security Best Practices
1. **Use strong, unique secrets** for all authentication
2. **Enable HTTPS** for all production deployments
3. **Regularly update** dependencies and certificates
4. **Monitor** for security vulnerabilities
5. **Implement** proper access controls

### Performance Best Practices
1. **Enable caching** for frequently accessed data
2. **Use compression** for all HTTP responses
3. **Monitor** resource usage and set limits
4. **Optimize** database queries and API calls
5. **Implement** proper error handling

### Operational Best Practices
1. **Automate** deployment and configuration
2. **Monitor** all critical components
3. **Document** all procedures and configurations
4. **Test** disaster recovery procedures
5. **Maintain** regular backups

## Support and Maintenance

### Regular Maintenance Tasks
- **Weekly**: Review logs and metrics
- **Monthly**: Update dependencies and certificates
- **Quarterly**: Review and update configuration
- **Annually**: Security audit and penetration testing

### Support Contacts
- **Development Team**: For code-related issues
- **DevOps Team**: For deployment and infrastructure
- **Security Team**: For security-related concerns
- **Business Team**: For functional requirements

### Documentation Updates
This configuration summary should be updated whenever:
- New features are added
- Configuration options change
- Security requirements change
- Deployment procedures change

---

**Last Updated**: [Current Date]
**Version**: 1.0.0
**Maintained By**: Development Team