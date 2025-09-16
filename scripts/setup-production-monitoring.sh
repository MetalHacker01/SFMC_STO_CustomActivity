#!/bin/bash

# Setup Production Monitoring for Send Time Optimization Activity
# This script sets up comprehensive production monitoring including:
# - Prometheus metrics collection
# - Grafana dashboards
# - Alertmanager notifications
# - Health checks
# - Performance monitoring

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MONITORING_DIR="$PROJECT_DIR/monitoring"

echo -e "${BLUE}Setting up Production Monitoring for STO Activity${NC}"
echo "=================================================="

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker and try again"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose and try again"
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"

# Check if environment file exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    if [ -f "$PROJECT_DIR/.env.production" ]; then
        echo -e "${BLUE}Creating .env from .env.production template...${NC}"
        cp "$PROJECT_DIR/.env.production" "$PROJECT_DIR/.env"
        echo -e "${YELLOW}Please edit .env file with your monitoring configuration${NC}"
    else
        echo -e "${RED}Error: No environment template found${NC}"
        exit 1
    fi
fi

# Load environment variables
source "$PROJECT_DIR/.env"

# Validate required monitoring environment variables
echo -e "${BLUE}Validating monitoring configuration...${NC}"

required_vars=(
    "GRAFANA_ADMIN_PASSWORD"
    "ALERT_EMAIL_RECIPIENTS"
)

optional_vars=(
    "SMTP_HOST"
    "SMTP_PORT"
    "SMTP_USER"
    "SMTP_PASS"
    "SLACK_WEBHOOK_URL"
    "SLACK_CHANNEL"
)

missing_required=()
missing_optional=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_required+=("$var")
    fi
done

for var in "${optional_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_optional+=("$var")
    fi
done

if [ ${#missing_required[@]} -ne 0 ]; then
    echo -e "${RED}Error: Missing required environment variables:${NC}"
    printf '%s\n' "${missing_required[@]}"
    echo -e "${YELLOW}Please set these variables in your .env file${NC}"
    exit 1
fi

if [ ${#missing_optional[@]} -ne 0 ]; then
    echo -e "${YELLOW}Warning: Missing optional environment variables:${NC}"
    printf '%s\n' "${missing_optional[@]}"
    echo -e "${YELLOW}Some monitoring features may not work properly${NC}"
fi

echo -e "${GREEN}✓ Monitoring configuration validated${NC}"

# Create monitoring directories
echo -e "${BLUE}Creating monitoring directories...${NC}"

directories=(
    "$MONITORING_DIR/data/prometheus"
    "$MONITORING_DIR/data/grafana"
    "$MONITORING_DIR/data/alertmanager"
    "$MONITORING_DIR/logs"
    "$MONITORING_DIR/backups"
)

for dir in "${directories[@]}"; do
    mkdir -p "$dir"
    echo "Created: $dir"
done

# Set proper permissions
echo -e "${BLUE}Setting directory permissions...${NC}"

if [ "$(id -u)" -eq 0 ]; then
    # Running as root
    chown -R 65534:65534 "$MONITORING_DIR/data/prometheus"
    chown -R 472:472 "$MONITORING_DIR/data/grafana"
    chown -R 65534:65534 "$MONITORING_DIR/data/alertmanager"
    echo -e "${GREEN}✓ Permissions set for root user${NC}"
else
    # Running as regular user
    echo -e "${YELLOW}Note: Running as non-root user. You may need to adjust permissions manually.${NC}"
    echo "If you encounter permission issues, run:"
    echo "  sudo chown -R 65534:65534 $MONITORING_DIR/data/prometheus"
    echo "  sudo chown -R 472:472 $MONITORING_DIR/data/grafana"
    echo "  sudo chown -R 65534:65534 $MONITORING_DIR/data/alertmanager"
fi

# Validate configuration files
echo -e "${BLUE}Validating configuration files...${NC}"

config_files=(
    "$MONITORING_DIR/prometheus.yml"
    "$MONITORING_DIR/alertmanager.yml"
    "$MONITORING_DIR/alert_rules.yml"
    "$MONITORING_DIR/docker-compose.monitoring.yml"
)

for config_file in "${config_files[@]}"; do
    if [ ! -f "$config_file" ]; then
        echo -e "${RED}Error: Configuration file not found: $config_file${NC}"
        exit 1
    fi
    echo "✓ Found: $(basename "$config_file")"
done

# Validate Prometheus configuration
echo -e "${BLUE}Validating Prometheus configuration...${NC}"
if command -v promtool &> /dev/null; then
    if promtool check config "$MONITORING_DIR/prometheus.yml"; then
        echo -e "${GREEN}✓ Prometheus configuration is valid${NC}"
    else
        echo -e "${RED}Error: Invalid Prometheus configuration${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Warning: promtool not found, skipping Prometheus config validation${NC}"
fi

# Validate Alertmanager configuration
echo -e "${BLUE}Validating Alertmanager configuration...${NC}"
if command -v amtool &> /dev/null; then
    if amtool config routes test --config.file="$MONITORING_DIR/alertmanager.yml"; then
        echo -e "${GREEN}✓ Alertmanager configuration is valid${NC}"
    else
        echo -e "${RED}Error: Invalid Alertmanager configuration${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Warning: amtool not found, skipping Alertmanager config validation${NC}"
fi

# Check if main application is running
echo -e "${BLUE}Checking main application status...${NC}"
if docker ps | grep -q "sto-activity"; then
    echo -e "${GREEN}✓ Main application is running${NC}"
else
    echo -e "${YELLOW}Warning: Main application is not running${NC}"
    echo "The monitoring stack will start, but some metrics may not be available"
    echo "Start the main application with: docker-compose -f docker-compose.production.yml up -d"
fi

# Pull monitoring images
echo -e "${BLUE}Pulling monitoring Docker images...${NC}"
cd "$PROJECT_DIR"
docker-compose -f monitoring/docker-compose.monitoring.yml pull

# Start monitoring stack
echo -e "${BLUE}Starting monitoring services...${NC}"
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml up -d \
    prometheus alertmanager grafana node-exporter cadvisor blackbox-exporter

# Wait for services to be ready
echo -e "${BLUE}Waiting for services to be ready...${NC}"
sleep 15

# Check service health
services=(
    "prometheus:9090:/-/healthy"
    "alertmanager:9093:/-/healthy"
    "grafana:3001:/api/health"
    "node-exporter:9100:/metrics"
    "cadvisor:8080:/healthz"
    "blackbox-exporter:9115:/metrics"
)

all_healthy=true

for service_info in "${services[@]}"; do
    IFS=':' read -r name port endpoint <<< "$service_info"
    
    echo -n "Checking $name... "
    
    max_attempts=10
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "http://localhost:$port$endpoint" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Ready${NC}"
            break
        fi
        
        if [ $attempt -eq $max_attempts ]; then
            echo -e "${RED}✗ Not ready after $max_attempts attempts${NC}"
            all_healthy=false
            break
        fi
        
        sleep 2
        ((attempt++))
    done
done

# Start optional services based on configuration
if [ "$REDIS_ENABLED" = "true" ]; then
    echo -e "${BLUE}Starting Redis monitoring...${NC}"
    docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml --profile redis up -d redis-exporter
fi

if [ "$POSTGRES_ENABLED" = "true" ]; then
    echo -e "${BLUE}Starting PostgreSQL monitoring...${NC}"
    docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml --profile postgres up -d postgres-exporter
fi

# Import Grafana dashboards
echo -e "${BLUE}Setting up Grafana dashboards...${NC}"

# Wait for Grafana to be fully ready
sleep 10

# Check if dashboards directory exists and has dashboards
if [ -d "$MONITORING_DIR/grafana/dashboards" ] && [ "$(ls -A $MONITORING_DIR/grafana/dashboards/*.json 2>/dev/null)" ]; then
    echo "Grafana dashboards will be automatically provisioned"
else
    echo -e "${YELLOW}Warning: No dashboard files found in $MONITORING_DIR/grafana/dashboards/${NC}"
fi

# Test alert system
echo -e "${BLUE}Testing alert system...${NC}"

if [ "$EMAIL_ALERTS_ENABLED" = "true" ] && [ -n "$ALERT_EMAIL_RECIPIENTS" ]; then
    echo "Sending test alert to verify email configuration..."
    
    test_alert_payload='[{
        "labels": {
            "alertname": "MonitoringSetupTest",
            "service": "sto-activity",
            "severity": "info"
        },
        "annotations": {
            "summary": "Monitoring setup test alert",
            "description": "This is a test alert sent during monitoring setup to verify the alerting system is working correctly."
        },
        "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
        "endsAt": "'$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%S.%3NZ)'"
    }]'
    
    if curl -s -X POST http://localhost:9093/api/v1/alerts \
        -H "Content-Type: application/json" \
        -d "$test_alert_payload" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Test alert sent successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Failed to send test alert${NC}"
    fi
else
    echo -e "${YELLOW}Email alerts not configured, skipping test${NC}"
fi

# Create monitoring status script
echo -e "${BLUE}Creating monitoring status script...${NC}"

cat > "$PROJECT_DIR/scripts/monitoring-status.sh" << 'EOF'
#!/bin/bash

# Monitoring Status Script
# Shows the status of all monitoring components

echo "STO Activity Monitoring Status"
echo "=============================="

# Check service status
echo ""
echo "Service Status:"
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml ps

# Check service health
echo ""
echo "Health Checks:"
services=("prometheus:9090" "alertmanager:9093" "grafana:3001" "node-exporter:9100")

for service in "${services[@]}"; do
    name=$(echo "$service" | cut -d: -f1)
    port=$(echo "$service" | cut -d: -f2)
    
    if curl -s -f "http://localhost:$port" > /dev/null 2>&1; then
        echo "✓ $name (http://localhost:$port)"
    else
        echo "✗ $name (http://localhost:$port)"
    fi
done

# Show resource usage
echo ""
echo "Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep -E "(prometheus|grafana|alertmanager|node-exporter|cadvisor)"

echo ""
echo "Access URLs:"
echo "• Prometheus:    http://localhost:9090"
echo "• Alertmanager:  http://localhost:9093"
echo "• Grafana:       http://localhost:3001"
echo "• Node Exporter: http://localhost:9100"
echo "• cAdvisor:      http://localhost:8080"
EOF

chmod +x "$PROJECT_DIR/scripts/monitoring-status.sh"

# Display final status
echo ""
echo -e "${GREEN}Production Monitoring Setup Complete!${NC}"
echo "=================================================="

if [ "$all_healthy" = true ]; then
    echo -e "${GREEN}✓ All monitoring services are healthy${NC}"
else
    echo -e "${YELLOW}⚠ Some services may not be fully ready${NC}"
    echo "Check the logs for more details:"
    echo "  docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml logs"
fi

echo ""
echo -e "${BLUE}Service URLs:${NC}"
echo "• Prometheus:    http://localhost:9090"
echo "• Alertmanager:  http://localhost:9093"
echo "• Grafana:       http://localhost:3001"
echo "  - Username: admin"
echo "  - Password: $GRAFANA_ADMIN_PASSWORD"
echo "• Node Exporter: http://localhost:9100"
echo "• cAdvisor:      http://localhost:8080"

if [ "$REDIS_ENABLED" = "true" ]; then
    echo "• Redis Exporter: http://localhost:9121"
fi

if [ "$POSTGRES_ENABLED" = "true" ]; then
    echo "• Postgres Exporter: http://localhost:9187"
fi

echo ""
echo -e "${BLUE}Useful Commands:${NC}"
echo "• Check status:  ./scripts/monitoring-status.sh"
echo "• View logs:     docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml logs -f"
echo "• Stop services: docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml down"
echo "• Restart:       ./scripts/start-monitoring.sh"

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Access Grafana at http://localhost:3001 and explore the dashboards"
echo "2. Configure additional alert channels if needed"
echo "3. Set up log aggregation for comprehensive monitoring"
echo "4. Configure backup procedures for monitoring data"

echo ""
echo -e "${GREEN}Production monitoring is now active and collecting metrics!${NC}"