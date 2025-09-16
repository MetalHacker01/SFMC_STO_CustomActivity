#!/bin/bash

# Start Monitoring Stack for Send Time Optimization Activity
# This script starts the complete monitoring infrastructure

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

echo -e "${BLUE}Starting Send Time Optimization Activity Monitoring Stack${NC}"
echo "=================================================="

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

# Check if environment file exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found. Creating from template...${NC}"
    if [ -f "$PROJECT_DIR/.env.production" ]; then
        cp "$PROJECT_DIR/.env.production" "$PROJECT_DIR/.env"
        echo -e "${YELLOW}Please edit .env file with your configuration${NC}"
    else
        echo -e "${RED}Error: No environment template found${NC}"
        exit 1
    fi
fi

# Load environment variables
source "$PROJECT_DIR/.env"

# Validate required monitoring environment variables
required_vars=(
    "GRAFANA_ADMIN_PASSWORD"
    "ALERT_EMAIL_RECIPIENTS"
)

missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo -e "${RED}Error: Missing required environment variables:${NC}"
    printf '%s\n' "${missing_vars[@]}"
    echo -e "${YELLOW}Please set these variables in your .env file${NC}"
    exit 1
fi

# Create monitoring directories if they don't exist
echo -e "${BLUE}Creating monitoring directories...${NC}"
mkdir -p "$MONITORING_DIR/data/prometheus"
mkdir -p "$MONITORING_DIR/data/grafana"
mkdir -p "$MONITORING_DIR/data/alertmanager"

# Set proper permissions
if [ "$(id -u)" -eq 0 ]; then
    # Running as root
    chown -R 65534:65534 "$MONITORING_DIR/data/prometheus"
    chown -R 472:472 "$MONITORING_DIR/data/grafana"
    chown -R 65534:65534 "$MONITORING_DIR/data/alertmanager"
else
    # Running as regular user
    echo -e "${YELLOW}Note: Running as non-root user. You may need to adjust permissions manually.${NC}"
fi

# Check if main application is running
echo -e "${BLUE}Checking main application status...${NC}"
if docker ps | grep -q "sto-activity"; then
    echo -e "${GREEN}✓ Main application is running${NC}"
else
    echo -e "${YELLOW}Warning: Main application is not running. Starting monitoring anyway...${NC}"
fi

# Start monitoring stack
echo -e "${BLUE}Starting monitoring services...${NC}"
cd "$PROJECT_DIR"

# Start core monitoring services
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml up -d prometheus alertmanager grafana node-exporter cadvisor blackbox-exporter

# Wait for services to be ready
echo -e "${BLUE}Waiting for services to be ready...${NC}"
sleep 10

# Check service health
services=("prometheus:9090" "alertmanager:9093" "grafana:3001")
for service in "${services[@]}"; do
    name=$(echo "$service" | cut -d: -f1)
    port=$(echo "$service" | cut -d: -f2)
    
    echo -n "Checking $name... "
    if curl -s -f "http://localhost:$port" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Ready${NC}"
    else
        echo -e "${RED}✗ Not ready${NC}"
    fi
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

# Display service URLs
echo ""
echo -e "${GREEN}Monitoring Stack Started Successfully!${NC}"
echo "=================================================="
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
echo "• View logs:     docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml logs -f"
echo "• Stop services: docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml down"
echo "• Restart:       $0"

# Test alert system
echo ""
echo -e "${BLUE}Testing alert system...${NC}"
if [ "$EMAIL_ALERTS_ENABLED" = "true" ]; then
    echo "Sending test alert to verify email configuration..."
    curl -s -X POST http://localhost:9093/api/v1/alerts \
        -H "Content-Type: application/json" \
        -d '[{
            "labels": {
                "alertname": "TestAlert",
                "service": "sto-activity",
                "severity": "info"
            },
            "annotations": {
                "summary": "Monitoring stack test alert",
                "description": "This is a test alert to verify the monitoring system is working correctly."
            },
            "startsAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'",
            "endsAt": "'$(date -u -d '+1 minute' +%Y-%m-%dT%H:%M:%S.%3NZ)'"
        }]' > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Test alert sent successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Failed to send test alert${NC}"
    fi
fi

echo ""
echo -e "${GREEN}Monitoring setup complete!${NC}"
echo -e "${YELLOW}Note: It may take a few minutes for all dashboards and alerts to be fully functional.${NC}"