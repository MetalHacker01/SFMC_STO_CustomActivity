#!/bin/bash

# Stop Monitoring Stack for Send Time Optimization Activity
# This script stops all monitoring services gracefully

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

echo -e "${BLUE}Stopping Send Time Optimization Activity Monitoring Stack${NC}"
echo "=================================================="

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

cd "$PROJECT_DIR"

# Stop monitoring services
echo -e "${BLUE}Stopping monitoring services...${NC}"
docker-compose -f docker-compose.production.yml -f monitoring/docker-compose.monitoring.yml down

# Optional: Remove volumes (uncomment if you want to remove all data)
# echo -e "${YELLOW}Removing monitoring data volumes...${NC}"
# docker volume rm $(docker volume ls -q | grep -E "(prometheus|grafana|alertmanager)-data") 2>/dev/null || true

echo -e "${GREEN}Monitoring stack stopped successfully!${NC}"

# Show remaining containers
echo ""
echo -e "${BLUE}Remaining containers:${NC}"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"