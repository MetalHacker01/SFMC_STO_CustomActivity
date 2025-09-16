# Send Time Optimization Activity - Monitoring Guide

This guide covers the comprehensive monitoring setup for the Send Time Optimization (STO) Custom Journey Activity, including metrics collection, alerting, and dashboards.

## Table of Contents

1. [Overview](#overview)
2. [Monitoring Stack](#monitoring-stack)
3. [Setup Instructions](#setup-instructions)
4. [Metrics and KPIs](#metrics-and-kpis)
5. [Dashboards](#dashboards)
6. [Alerting](#alerting)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

## Overview

The monitoring system provides comprehensive observability for the STO Activity including:

- **Application Performance**: Response times, throughput, error rates
- **Business Metrics**: Contact processing rates, send time calculations
- **System Health**: CPU, memory, disk usage
- **External Dependencies**: SFMC API, Holiday API status
- **Infrastructure**: Container metrics, network performance

## Monitoring Stack

### Core Components

| Component | Purpose | Port | URL |
|-----------|---------|------|-----|
| **Prometheus** | Metrics collection and storage | 9090 | http://localhost:9090 |
| **Grafana** | Dashboards and visualization | 3001 | http://localhost:3001 |
| **Alertmanager** | Alert management and routing | 9093 | http://localhost:9093 |
| **Node Exporter** | System metrics | 9100 | http://localhost:9100 |
| **cAdvisor** | Container metrics | 8080 | http://localhost:8080 |
| **Blackbox Exporter** | External endpoint monitoring | 9115 | http://localhost:9115 |

### Optional Components

| Component | Purpose | Port | Condition |
|-----------|---------|------|-----------|
| **Redis Exporter** | Redis cache metrics | 9121 | If Redis enabled |
| **Postgres Exporter** | Database metrics | 9187 | If PostgreSQL enabled |

## Setup Instructions

### Prerequisites

- Docker and Docker Compose installed
- Main STO Activity application running
- Environment variables configured

### Quick Start

1. **Configure Environment Variables**

```bash
# Copy environment template
cp .env.production .env

# Edit monitoring-specific variables
nano .env
```

Required monitoring variables:
```bash
# Grafana
GRAFANA_ADMIN_PASSWORD=your-secure-password

# Email Alerts
EMAIL_ALERTS_ENABLED=true
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
ALERT_EMAIL_RECIPIENTS=admin@yourcompany.com,ops@yourcompany.com

# Slack Alerts (optional)
SLACK_ALERTS_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SLACK_CHANNEL=#alerts
```

2. **Start Monitoring Stack**

```bash
# Make script executable (Linux/Mac)
chmod +x scripts/start-monitoring.sh

# Start monitoring services
./scripts/start-monitoring.sh

# Or manually with Docker Compose
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml up -d
```

3. **Verify Setup**

```bash
# Check service status
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml ps

# Test endpoints
curl -f http://localhost:9090/-/healthy  # Prometheus
curl -f http://localhost:9093/-/healthy  # Alertmanager
curl -f http://localhost:3001/api/health # Grafana
```

### Manual Configuration

#### Prometheus Configuration

The Prometheus configuration (`monitoring/prometheus.yml`) includes:

- **Scrape Configs**: Application metrics, health checks, system metrics
- **Alert Rules**: Performance and business logic alerts
- **Storage**: 30-day retention with 10GB size limit

Key scrape targets:
```yaml
scrape_configs:
  - job_name: 'sto-activity'
    static_configs:
      - targets: ['sto-activity:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

#### Grafana Dashboards

Pre-configured dashboards include:

1. **STO Activity Overview**: Application status, request rates, response times
2. **Business Metrics**: Contact processing, send time calculations
3. **System Performance**: CPU, memory, disk usage
4. **External Dependencies**: SFMC API, Holiday API status

#### Alertmanager Rules

Alert categories:

- **Critical**: Application down, SFMC integration failures
- **Warning**: High error rates, performance issues
- **Business**: Contact processing failures, data quality issues

## Metrics and KPIs

### Application Metrics

#### HTTP Metrics
```
sto_activity_http_requests_total{method, status, endpoint}
sto_activity_http_request_duration_seconds{method, endpoint, quantile}
sto_activity_http_request_size_bytes{method, endpoint}
sto_activity_http_response_size_bytes{method, endpoint}
```

#### Business Logic Metrics
```
sto_activity_contacts_processed_total{status}
sto_activity_contact_processing_duration_seconds{quantile}
sto_activity_send_time_calculations_total
sto_activity_send_time_calculation_duration_seconds{quantile}
sto_activity_timezone_calculations_total{country}
sto_activity_holiday_checks_total{country, result}
```

#### Error Metrics
```
sto_activity_errors_total{type, component}
sto_activity_sfmc_api_failures_total{operation}
sto_activity_holiday_api_failures_total
sto_activity_data_extension_update_failures_total
```

### System Metrics

#### Resource Usage
```
sto_activity_memory_usage_bytes
sto_activity_memory_limit_bytes
sto_activity_cpu_usage_ratio
sto_activity_disk_usage_bytes{mountpoint}
```

#### Cache Metrics
```
sto_activity_cache_hits_total{cache_type}
sto_activity_cache_misses_total{cache_type}
sto_activity_cache_size{cache_type}
sto_activity_cache_evictions_total{cache_type}
```

### Key Performance Indicators (KPIs)

#### Availability KPIs
- **Uptime**: Target 99.9%
- **Health Status**: All components healthy
- **Response Time**: 95th percentile < 5 seconds

#### Performance KPIs
- **Throughput**: Requests per second
- **Error Rate**: < 1% for 4xx, < 0.1% for 5xx
- **Contact Processing Rate**: Contacts processed per minute

#### Business KPIs
- **Send Time Calculation Success Rate**: > 99%
- **SFMC Integration Success Rate**: > 99.5%
- **Data Quality**: < 5% missing geosegment data

## Dashboards

### Main Dashboard Panels

#### 1. Application Status Panel
- Service uptime status
- Health check results
- Version information
- Last deployment time

#### 2. Performance Overview
- Request rate (requests/second)
- Response time percentiles
- Error rate by status code
- Active connections

#### 3. Business Metrics
- Contact processing rate
- Send time calculation performance
- Timezone distribution
- Holiday API usage

#### 4. System Resources
- CPU usage over time
- Memory consumption
- Disk space utilization
- Network I/O

#### 5. External Dependencies
- SFMC API response times
- Holiday API availability
- Cache hit/miss ratios
- Database connection pool status

### Custom Dashboard Creation

To create custom dashboards:

1. **Access Grafana**: http://localhost:3001
2. **Login**: admin / [your-password]
3. **Create Dashboard**: + → Dashboard
4. **Add Panel**: Add new panel
5. **Configure Query**: Use Prometheus as data source

Example query for contact processing rate:
```promql
rate(sto_activity_contacts_processed_total[5m])
```

## Alerting

### Alert Categories

#### Critical Alerts (Immediate Response)
- **Application Down**: Service not responding
- **SFMC Integration Failure**: Cannot communicate with SFMC
- **High Error Rate**: > 20% error rate
- **Memory Exhaustion**: > 95% memory usage

#### Warning Alerts (Monitor Closely)
- **High Response Time**: 95th percentile > 5 seconds
- **Moderate Error Rate**: 5-20% error rate
- **Resource Usage**: CPU > 80%, Memory > 85%
- **External API Issues**: Holiday API failures

#### Business Alerts (Business Impact)
- **Contact Processing Failures**: High failure rate
- **Data Quality Issues**: High missing data rate
- **Journey Builder Integration**: Configuration errors

### Alert Configuration

#### Email Alerts
```yaml
email_configs:
  - to: 'admin@yourcompany.com'
    subject: '[STO Activity] {{ .GroupLabels.alertname }}'
    body: |
      Alert: {{ .Annotations.summary }}
      Description: {{ .Annotations.description }}
      Severity: {{ .Labels.severity }}
```

#### Slack Alerts
```yaml
slack_configs:
  - api_url: 'YOUR_SLACK_WEBHOOK_URL'
    channel: '#alerts'
    title: '{{ .GroupLabels.alertname }}'
    text: '{{ .Annotations.summary }}'
    color: 'danger'
```

### Alert Testing

Test alert system:
```bash
# Send test alert
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "warning"
    },
    "annotations": {
      "summary": "Test alert",
      "description": "This is a test alert"
    }
  }]'
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
```bash
# Reduce dashboard refresh rate
# Set refresh interval to 1m instead of 30s

# Limit query time range
# Use shorter time ranges for heavy queries
```

## Maintenance

### Regular Tasks

#### Daily
- Check alert status
- Review error rates
- Monitor resource usage

#### Weekly
- Review dashboard performance
- Update alert thresholds if needed
- Check log retention

#### Monthly
- Update monitoring stack images
- Review and optimize queries
- Backup Grafana dashboards

### Backup Procedures

#### Grafana Dashboards
```bash
# Export dashboards
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

#### Configuration Changes
```bash
# Reload Prometheus configuration
curl -X POST http://localhost:9090/-/reload

# Reload Alertmanager configuration
curl -X POST http://localhost:9093/-/reload
```

### Scaling Considerations

#### High Volume Environments
- Increase Prometheus storage retention
- Use remote storage for long-term metrics
- Implement Prometheus federation
- Scale Grafana with load balancer

#### Multi-Instance Deployments
- Configure service discovery
- Use consistent labeling
- Implement cross-instance alerting
- Centralize log aggregation

This monitoring setup provides comprehensive observability for the Send Time Optimization Activity, enabling proactive issue detection and performance optimization.