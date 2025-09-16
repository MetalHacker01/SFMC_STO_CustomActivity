# Production Monitoring for Send Time Optimization Activity

This directory contains the complete production monitoring setup for the STO Activity, providing comprehensive observability, alerting, and performance monitoring.

## Overview

The production monitoring system includes:

- **Prometheus** - Metrics collection and storage
- **Grafana** - Dashboards and visualization
- **Alertmanager** - Alert management and routing
- **Node Exporter** - System metrics
- **cAdvisor** - Container metrics
- **Blackbox Exporter** - External endpoint monitoring
- **Custom Health Checks** - Application-specific monitoring
- **Business Metrics** - STO-specific performance indicators

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Environment variables configured in `.env` file
- Main STO Activity application running

### Setup

1. **Configure Environment Variables**

```bash
# Copy environment template
cp .env.production .env

# Edit monitoring configuration
nano .env
```

Required variables:
```bash
GRAFANA_ADMIN_PASSWORD=your-secure-password
ALERT_EMAIL_RECIPIENTS=admin@yourcompany.com,ops@yourcompany.com
```

Optional variables:
```bash
# Email alerts
EMAIL_ALERTS_ENABLED=true
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password

# Slack alerts
SLACK_ALERTS_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_CHANNEL=#alerts

# Webhook alerts
WEBHOOK_ALERTS_ENABLED=true
ALERT_WEBHOOK_URL=https://your-webhook-endpoint.com/alerts
WEBHOOK_TOKEN=your-webhook-token
```

2. **Start Monitoring Stack**

```bash
# Run setup script
./scripts/setup-production-monitoring.sh

# Or manually
./scripts/start-monitoring.sh
```

3. **Verify Setup**

```bash
# Check service status
./scripts/monitoring-status.sh

# View logs
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml logs -f
```

## Architecture

### Components

| Component | Purpose | Port | URL |
|-----------|---------|------|-----|
| **Prometheus** | Metrics collection | 9090 | http://localhost:9090 |
| **Grafana** | Dashboards | 3001 | http://localhost:3001 |
| **Alertmanager** | Alert management | 9093 | http://localhost:9093 |
| **Node Exporter** | System metrics | 9100 | http://localhost:9100 |
| **cAdvisor** | Container metrics | 8080 | http://localhost:8080 |
| **Blackbox Exporter** | Endpoint monitoring | 9115 | http://localhost:9115 |

### Data Flow

```
STO Activity → Prometheus → Grafana (Visualization)
     ↓              ↓
Health Checks → Alertmanager → Email/Slack/Webhook
```

## Metrics

### Application Metrics

#### HTTP Metrics
- `sto_activity_http_requests_total` - Total HTTP requests
- `sto_activity_http_request_duration_seconds` - Request duration
- `sto_activity_http_responses_total` - HTTP responses by status
- `sto_activity_http_errors_total` - HTTP errors

#### Business Metrics
- `sto_activity_contacts_processed_total` - Contacts processed
- `sto_activity_send_time_calculations_total` - Send time calculations
- `sto_activity_timezone_calculations_total` - Timezone calculations
- `sto_activity_holiday_checks_total` - Holiday checks
- `sto_activity_data_extension_updates_total` - Data extension updates

#### System Metrics
- `sto_activity_memory_usage_bytes` - Memory usage
- `sto_activity_cpu_usage_ratio` - CPU usage
- `sto_activity_uptime_seconds` - Process uptime
- `sto_activity_health_status` - Overall health status

#### Error Metrics
- `sto_activity_errors_total` - Total errors by type
- `sto_activity_sfmc_api_failures_total` - SFMC API failures
- `sto_activity_holiday_api_failures_total` - Holiday API failures

### System Metrics (Node Exporter)

- CPU usage, load average
- Memory usage and swap
- Disk usage and I/O
- Network statistics
- File system metrics

### Container Metrics (cAdvisor)

- Container CPU and memory usage
- Network and disk I/O per container
- Container lifecycle events

## Dashboards

### Main Dashboard: STO Activity Overview

**Panels:**
- Service status and health
- Request rate and response times
- Contact processing metrics
- Error rates and types
- System resource usage
- External API performance

### Production Dashboard: Comprehensive Monitoring

**Panels:**
- Business KPIs
- Performance metrics
- Component health status
- Cache performance
- Data quality metrics
- Alert status

### System Dashboard: Infrastructure Monitoring

**Panels:**
- CPU and memory usage
- Disk and network I/O
- Container metrics
- Process statistics

## Alerting

### Alert Categories

#### Critical Alerts (Immediate Response)
- **Service Down** - Application not responding
- **SFMC API Failures** - Cannot communicate with SFMC
- **High Error Rate** - >20% error rate
- **Memory Exhaustion** - >95% memory usage

#### Warning Alerts (Monitor Closely)
- **High Response Time** - 95th percentile >5 seconds
- **Moderate Error Rate** - 5-20% error rate
- **Resource Usage** - CPU >80%, Memory >85%
- **External API Issues** - Holiday API failures

#### Business Alerts (Business Impact)
- **Contact Processing Failures** - High failure rate
- **Data Quality Issues** - High missing data rate
- **Journey Builder Integration** - Configuration errors

### Alert Channels

#### Email Alerts
- Sent to configured recipients
- Includes alert details and context
- Different templates for different severities

#### Slack Alerts
- Posted to configured channel
- Rich formatting with colors and fields
- Mentions for critical alerts

#### Webhook Alerts
- HTTP POST to configured endpoint
- JSON payload with alert data
- Custom authentication headers

### Alert Rules Configuration

Located in `alert_rules.yml`:

```yaml
groups:
  - name: sto-activity-alerts
    rules:
      - alert: STOActivityDown
        expr: up{job="sto-activity"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "STO Activity is down"
          description: "STO Activity has been down for more than 1 minute"
```

## Health Checks

### Built-in Health Checks

1. **System Health**
   - Memory and CPU usage
   - Process uptime
   - Environment configuration

2. **Timezone Engine**
   - Timezone calculation functionality
   - Supported countries validation
   - Performance testing

3. **SFMC Connectivity**
   - API credentials validation
   - Connection testing
   - Authentication status

4. **Holiday API**
   - API availability
   - Response time monitoring
   - Fallback mechanism status

5. **Journey Builder Integration**
   - JWT configuration
   - Activity configuration
   - Endpoint availability

### Health Check Endpoints

- `/health` - Basic health status
- `/health/detailed` - Comprehensive health report
- `/health/production` - Production-specific health checks

### Health Status Levels

- **Healthy** (1) - All systems operational
- **Degraded** (2) - Some issues but functional
- **Unhealthy** (0) - Critical issues detected

## Configuration Files

### Prometheus Configuration (`prometheus.yml`)

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'sto-activity'
    static_configs:
      - targets: ['sto-activity:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Alertmanager Configuration (`alertmanager.yml`)

```yaml
global:
  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'
  smtp_from: '${SMTP_FROM}'

route:
  group_by: ['alertname', 'service']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 12h
  receiver: 'default-receiver'
```

### Grafana Configuration

- **Data Sources**: Automatically configured Prometheus
- **Dashboards**: Provisioned from JSON files
- **Users**: Admin user with configured password

## Maintenance

### Daily Tasks

- Check alert status in Grafana
- Review error rates and performance metrics
- Monitor resource usage trends
- Verify backup processes

### Weekly Tasks

- Review and update alert thresholds
- Check dashboard performance
- Update monitoring stack images
- Review log retention policies

### Monthly Tasks

- Backup Grafana dashboards and configuration
- Review and optimize Prometheus queries
- Update monitoring documentation
- Conduct monitoring system health review

### Backup Procedures

#### Grafana Dashboards

```bash
# Export all dashboards
curl -u admin:password http://localhost:3001/api/search | \
  jq -r '.[] | select(.type=="dash-db") | .uid' | \
  xargs -I {} curl -u admin:password \
  http://localhost:3001/api/dashboards/uid/{} > dashboard-{}.json
```

#### Prometheus Data

```bash
# Backup Prometheus data
docker run --rm -v sto-prometheus-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/prometheus-backup-$(date +%Y%m%d).tar.gz /data
```

### Updates and Upgrades

#### Update Monitoring Stack

```bash
# Pull latest images
docker-compose -f monitoring/docker-compose.monitoring.yml pull

# Restart services
docker-compose -f monitoring/docker-compose.monitoring.yml up -d
```

#### Configuration Reload

```bash
# Reload Prometheus configuration
curl -X POST http://localhost:9090/-/reload

# Reload Alertmanager configuration
curl -X POST http://localhost:9093/-/reload
```

## Troubleshooting

### Common Issues

#### 1. Metrics Not Appearing

**Symptoms**: Empty dashboards, no data in Prometheus

**Solutions**:
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Verify application metrics endpoint
curl http://localhost:3000/metrics

# Check Prometheus logs
docker logs sto-prometheus
```

#### 2. Alerts Not Firing

**Symptoms**: No alert notifications despite issues

**Solutions**:
```bash
# Check Alertmanager status
curl http://localhost:9093/api/v1/status

# Verify alert rules
curl http://localhost:9090/api/v1/rules

# Test SMTP configuration
docker exec sto-alertmanager amtool config routes test
```

#### 3. Grafana Dashboard Issues

**Symptoms**: Dashboard panels showing "No data"

**Solutions**:
```bash
# Check Grafana logs
docker logs sto-grafana

# Verify data source connection
curl -u admin:password http://localhost:3001/api/datasources

# Test Prometheus query
curl 'http://localhost:9090/api/v1/query?query=up'
```

### Performance Optimization

#### Reduce Prometheus Storage

```yaml
# In prometheus.yml
global:
  scrape_interval: 60s  # Increase from 15s
  evaluation_interval: 60s

# Reduce retention
storage:
  tsdb:
    retention.time: 15d  # Reduce from 30d
```

#### Optimize Grafana

- Reduce dashboard refresh rates
- Use shorter time ranges for heavy queries
- Limit concurrent dashboard loads

### Log Analysis

#### View Service Logs

```bash
# All monitoring services
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml logs -f

# Specific service
docker logs sto-prometheus -f
docker logs sto-grafana -f
docker logs sto-alertmanager -f
```

#### Log Locations

- **Prometheus**: `/prometheus` (in container)
- **Grafana**: `/var/log/grafana` (in container)
- **Alertmanager**: `/alertmanager` (in container)

## Security Considerations

### Access Control

- Grafana admin password protection
- Prometheus and Alertmanager access restrictions
- Network isolation using Docker networks

### Data Protection

- Metrics data encryption in transit
- Secure credential storage in environment variables
- Regular security updates for monitoring components

### Alert Security

- Secure SMTP configuration
- Webhook authentication
- Sensitive data filtering in alerts

## Integration with CI/CD

### Deployment Monitoring

- Monitor deployment events
- Track application version changes
- Alert on deployment failures

### Performance Regression Detection

- Compare metrics across deployments
- Automated performance testing
- Rollback triggers based on metrics

## Scaling Considerations

### High Volume Environments

- Increase Prometheus storage retention
- Use remote storage for long-term metrics
- Implement Prometheus federation
- Scale Grafana with load balancer

### Multi-Instance Deployments

- Configure service discovery
- Use consistent labeling
- Implement cross-instance alerting
- Centralize log aggregation

## Support and Documentation

### Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)

### Getting Help

1. Check the troubleshooting section above
2. Review service logs for error messages
3. Consult the monitoring status endpoint: `/monitoring/status`
4. Contact the development team with specific error details

This production monitoring setup provides comprehensive observability for the Send Time Optimization Activity, enabling proactive issue detection, performance optimization, and reliable service delivery.