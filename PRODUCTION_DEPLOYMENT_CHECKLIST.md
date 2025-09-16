# Production Deployment Checklist

This checklist ensures a complete and secure production deployment of the Send Time Optimization Activity.

## Pre-Deployment Checklist

### 1. Environment Setup ✓

- [ ] **Server Requirements**
  - [ ] Node.js 18.x or higher installed
  - [ ] Minimum 512MB RAM available
  - [ ] Minimum 2GB disk space available
  - [ ] HTTPS access configured
  - [ ] Firewall rules configured (ports 80, 443)

- [ ] **Environment Configuration**
  - [ ] Copy `.env.production` to `.env`
  - [ ] Configure all required environment variables
  - [ ] Generate secure JWT secret (min 32 characters)
  - [ ] Configure SFMC API credentials
  - [ ] Set up SSL certificates
  - [ ] Run environment validation: `./scripts/validate-environment.sh`

- [ ] **Security Configuration**
  - [ ] SSL/TLS certificates installed and valid
  - [ ] Strong JWT secret configured
  - [ ] CORS origins properly configured
  - [ ] Rate limiting configured
  - [ ] Security headers enabled
  - [ ] File permissions set correctly (600 for .env, 700 for ssl/)

### 2. SFMC Integration Setup ✓

- [ ] **SFMC Configuration**
  - [ ] App Extension created in SFMC
  - [ ] API credentials generated
  - [ ] Data Extension configured
  - [ ] Journey Builder activity registered
  - [ ] Test SFMC connectivity

- [ ] **API Configuration**
  - [ ] SFMC_CLIENT_ID configured
  - [ ] SFMC_CLIENT_SECRET configured
  - [ ] SFMC_SUBDOMAIN configured
  - [ ] SFMC_ACCOUNT_ID configured
  - [ ] APP_EXTENSION_KEY configured
  - [ ] API URLs configured correctly

### 3. External Services ✓

- [ ] **Holiday API**
  - [ ] Holiday API URL configured
  - [ ] API connectivity tested
  - [ ] Fallback data prepared
  - [ ] Cache configuration set

- [ ] **Optional Services**
  - [ ] Redis configured (if using)
  - [ ] PostgreSQL configured (if using)
  - [ ] Monitoring services configured
  - [ ] Log aggregation configured

## Deployment Process

### 1. Code Deployment ✓

- [ ] **Source Code**
  - [ ] Latest code deployed to server
  - [ ] Dependencies installed: `npm ci --only=production`
  - [ ] Configuration files in place
  - [ ] Scripts made executable

- [ ] **File Structure**
  - [ ] Application files in correct location
  - [ ] Log directory created: `/var/log/sto-activity`
  - [ ] SSL directory created and secured
  - [ ] Data directory created for caching

### 2. Configuration Validation ✓

- [ ] **Environment Validation**
  - [ ] Run: `./scripts/validate-environment.sh`
  - [ ] All required variables present
  - [ ] SSL configuration valid
  - [ ] SFMC connectivity confirmed
  - [ ] Holiday API connectivity confirmed

- [ ] **Security Validation**
  - [ ] SSL certificate valid and not expiring soon
  - [ ] JWT secret is strong and unique
  - [ ] File permissions correct
  - [ ] No sensitive data in logs

### 3. Application Startup ✓

- [ ] **Initial Startup**
  - [ ] Run: `./scripts/production-startup.sh`
  - [ ] Application starts without errors
  - [ ] Health checks pass
  - [ ] All components initialized

- [ ] **Process Management**
  - [ ] PM2 configured (if using)
  - [ ] Process monitoring enabled
  - [ ] Auto-restart configured
  - [ ] Resource limits set

## Post-Deployment Verification

### 1. Health Checks ✓

- [ ] **Basic Health**
  - [ ] GET `/health` returns 200
  - [ ] GET `/health/detailed` shows all components healthy
  - [ ] Response times acceptable (< 1 second)

- [ ] **Component Health**
  - [ ] Timezone engine functional
  - [ ] Holiday API accessible
  - [ ] SFMC API connectivity
  - [ ] Data extension updates working

### 2. Functional Testing ✓

- [ ] **Core Functionality**
  - [ ] Contact processing works
  - [ ] Timezone calculations accurate
  - [ ] Holiday checking functional
  - [ ] Time window processing works
  - [ ] Data extension updates successful

- [ ] **Integration Testing**
  - [ ] Journey Builder integration works
  - [ ] Wait By Attribute compatibility
  - [ ] End-to-end journey testing
  - [ ] Error handling works correctly

### 3. Performance Testing ✓

- [ ] **Load Testing**
  - [ ] Application handles expected load
  - [ ] Response times under load acceptable
  - [ ] Memory usage stable
  - [ ] No memory leaks detected

- [ ] **Stress Testing**
  - [ ] Application recovers from high load
  - [ ] Rate limiting works correctly
  - [ ] Circuit breakers function
  - [ ] Graceful degradation works

### 4. Security Testing ✓

- [ ] **Security Validation**
  - [ ] SSL/TLS configuration secure
  - [ ] Security headers present
  - [ ] CORS configuration correct
  - [ ] Rate limiting functional
  - [ ] Input validation working

- [ ] **Vulnerability Testing**
  - [ ] No sensitive data exposed
  - [ ] Authentication working
  - [ ] Authorization working
  - [ ] No common vulnerabilities

## Monitoring and Alerting Setup

### 1. Application Monitoring ✓

- [ ] **Health Monitoring**
  - [ ] Health check endpoints monitored
  - [ ] Response time monitoring
  - [ ] Error rate monitoring
  - [ ] Uptime monitoring

- [ ] **Performance Monitoring**
  - [ ] CPU usage monitoring
  - [ ] Memory usage monitoring
  - [ ] Disk usage monitoring
  - [ ] Network monitoring

### 2. Business Monitoring ✓

- [ ] **Metrics Collection**
  - [ ] Contact processing metrics
  - [ ] Send time calculation metrics
  - [ ] Data extension update metrics
  - [ ] Error metrics

- [ ] **Custom Dashboards**
  - [ ] Application dashboard created
  - [ ] Business metrics dashboard
  - [ ] Error tracking dashboard
  - [ ] Performance dashboard

### 3. Alerting Configuration ✓

- [ ] **Critical Alerts**
  - [ ] Application down alerts
  - [ ] High error rate alerts
  - [ ] Performance degradation alerts
  - [ ] Security incident alerts

- [ ] **Warning Alerts**
  - [ ] High response time alerts
  - [ ] Resource usage alerts
  - [ ] Certificate expiry alerts
  - [ ] External service alerts

## Operational Procedures

### 1. Backup and Recovery ✓

- [ ] **Backup Procedures**
  - [ ] Configuration backup automated
  - [ ] Log backup configured
  - [ ] SSL certificate backup
  - [ ] Recovery procedures documented

- [ ] **Disaster Recovery**
  - [ ] Recovery plan documented
  - [ ] Recovery procedures tested
  - [ ] RTO/RPO defined
  - [ ] Failover procedures ready

### 2. Maintenance Procedures ✓

- [ ] **Regular Maintenance**
  - [ ] Update procedures documented
  - [ ] Restart procedures documented
  - [ ] Log rotation configured
  - [ ] Certificate renewal automated

- [ ] **Emergency Procedures**
  - [ ] Emergency contacts defined
  - [ ] Escalation procedures documented
  - [ ] Emergency shutdown procedures
  - [ ] Rollback procedures ready

## Documentation and Training

### 1. Documentation ✓

- [ ] **Operational Documentation**
  - [ ] Deployment guide complete
  - [ ] Configuration guide complete
  - [ ] Troubleshooting guide complete
  - [ ] API documentation complete

- [ ] **Process Documentation**
  - [ ] Startup procedures documented
  - [ ] Shutdown procedures documented
  - [ ] Update procedures documented
  - [ ] Monitoring procedures documented

### 2. Team Training ✓

- [ ] **Operations Team**
  - [ ] Deployment procedures trained
  - [ ] Monitoring procedures trained
  - [ ] Troubleshooting procedures trained
  - [ ] Emergency procedures trained

- [ ] **Development Team**
  - [ ] Architecture documented
  - [ ] Code structure documented
  - [ ] Testing procedures documented
  - [ ] Release procedures documented

## Final Verification

### 1. End-to-End Testing ✓

- [ ] **Complete Journey Test**
  - [ ] Create test journey in SFMC
  - [ ] Add STO activity to journey
  - [ ] Configure activity settings
  - [ ] Test with sample contacts
  - [ ] Verify send time calculations
  - [ ] Verify Wait By Attribute integration

- [ ] **Production Validation**
  - [ ] All systems operational
  - [ ] All monitoring active
  - [ ] All alerts configured
  - [ ] All documentation complete

### 2. Go-Live Checklist ✓

- [ ] **Pre Go-Live**
  - [ ] All stakeholders notified
  - [ ] Support team ready
  - [ ] Monitoring team ready
  - [ ] Rollback plan ready

- [ ] **Go-Live**
  - [ ] Application deployed
  - [ ] Health checks passing
  - [ ] Monitoring active
  - [ ] Initial traffic successful

- [ ] **Post Go-Live**
  - [ ] Monitor for 24 hours
  - [ ] Verify all functionality
  - [ ] Document any issues
  - [ ] Update procedures if needed

## Sign-Off

### Technical Sign-Off
- [ ] **Development Team Lead**: _________________ Date: _________
- [ ] **DevOps Engineer**: _________________ Date: _________
- [ ] **Security Engineer**: _________________ Date: _________
- [ ] **QA Lead**: _________________ Date: _________

### Business Sign-Off
- [ ] **Product Owner**: _________________ Date: _________
- [ ] **Business Stakeholder**: _________________ Date: _________
- [ ] **Operations Manager**: _________________ Date: _________

### Final Approval
- [ ] **Project Manager**: _________________ Date: _________
- [ ] **Technical Director**: _________________ Date: _________

---

## Quick Reference Commands

### Environment Management
```bash
# Initialize environment
./scripts/manage-environment.sh init

# Validate environment
./scripts/validate-environment.sh

# Generate secrets
./scripts/manage-environment.sh generate-secrets
```

### SSL Management
```bash
# Setup self-signed certificate (testing)
./scripts/ssl-setup.sh self-signed localhost

# Setup Let's Encrypt certificate
./scripts/ssl-setup.sh letsencrypt your-domain.com

# Check certificate status
./scripts/ssl-setup.sh check
```

### Application Management
```bash
# Start application
./scripts/production-startup.sh

# Restart application
./scripts/production-restart.sh

# Stop application
./scripts/production-shutdown.sh
```

### Health Checks
```bash
# Basic health check
curl -f https://your-domain.com/health

# Detailed health check
curl -s https://your-domain.com/health/detailed | jq '.'

# Metrics
curl -s https://your-domain.com/metrics
```

---

**Note**: This checklist should be customized based on your specific deployment environment and requirements. Ensure all team members are familiar with the procedures and have access to necessary credentials and documentation.