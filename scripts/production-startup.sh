#!/bin/bash

# Production Startup Script for Send Time Optimization Activity
# This script handles production deployment startup with proper validation and monitoring

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="/var/log/sto-activity"
PID_FILE="/var/run/sto-activity.pid"
ENV_FILE="$PROJECT_DIR/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root for security reasons"
        exit 1
    fi
}

# Function to validate environment
validate_environment() {
    log_info "Validating production environment..."
    
    # Check if environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        log_info "Please copy .env.production to .env and configure it"
        exit 1
    fi
    
    # Source environment variables
    set -a
    source "$ENV_FILE"
    set +a
    
    # Validate required environment variables
    local required_vars=(
        "NODE_ENV"
        "JWT_SECRET"
        "SFMC_CLIENT_ID"
        "SFMC_CLIENT_SECRET"
        "SFMC_SUBDOMAIN"
        "SFMC_ACCOUNT_ID"
        "APP_EXTENSION_KEY"
    )
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            log_error "  - $var"
        done
        exit 1
    fi
    
    # Validate JWT secret length
    if [[ ${#JWT_SECRET} -lt 32 ]]; then
        log_error "JWT_SECRET must be at least 32 characters long"
        exit 1
    fi
    
    # Validate SSL configuration if enabled
    if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
        if [[ ! -f "${SSL_KEY_PATH:-}" ]]; then
            log_error "SSL key file not found: ${SSL_KEY_PATH:-}"
            exit 1
        fi
        
        if [[ ! -f "${SSL_CERT_PATH:-}" ]]; then
            log_error "SSL certificate file not found: ${SSL_CERT_PATH:-}"
            exit 1
        fi
        
        # Check certificate validity
        if ! openssl x509 -in "${SSL_CERT_PATH}" -noout -checkend 86400 > /dev/null 2>&1; then
            log_warning "SSL certificate expires within 24 hours"
        fi
    fi
    
    log_success "Environment validation completed"
}

# Function to check system requirements
check_system_requirements() {
    log_info "Checking system requirements..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node --version | sed 's/v//')
    local required_version="18.0.0"
    
    if ! printf '%s\n%s\n' "$required_version" "$node_version" | sort -V -C; then
        log_error "Node.js version $node_version is below required version $required_version"
        exit 1
    fi
    
    # Check available memory
    local available_memory=$(free -m | awk 'NR==2{printf "%.0f", $7}')
    if [[ $available_memory -lt 512 ]]; then
        log_warning "Available memory ($available_memory MB) is below recommended 512 MB"
    fi
    
    # Check disk space
    local available_space=$(df "$PROJECT_DIR" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 1048576 ]]; then  # 1GB in KB
        log_warning "Available disk space is below recommended 1GB"
    fi
    
    log_success "System requirements check completed"
}

# Function to setup directories
setup_directories() {
    log_info "Setting up directories..."
    
    # Create log directory
    if [[ ! -d "$LOG_DIR" ]]; then
        sudo mkdir -p "$LOG_DIR"
        sudo chown "$USER:$USER" "$LOG_DIR"
        log_info "Created log directory: $LOG_DIR"
    fi
    
    # Create data directory for holiday cache
    local data_dir="$PROJECT_DIR/data"
    if [[ ! -d "$data_dir" ]]; then
        mkdir -p "$data_dir/holidays"
        log_info "Created data directory: $data_dir"
    fi
    
    # Create SSL directory if SSL is enabled
    if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
        local ssl_dir="$PROJECT_DIR/ssl"
        if [[ ! -d "$ssl_dir" ]]; then
            mkdir -p "$ssl_dir"
            chmod 700 "$ssl_dir"
            log_info "Created SSL directory: $ssl_dir"
        fi
    fi
    
    log_success "Directory setup completed"
}

# Function to install dependencies
install_dependencies() {
    log_info "Installing production dependencies..."
    
    cd "$PROJECT_DIR"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found in $PROJECT_DIR"
        exit 1
    fi
    
    # Install dependencies
    if command -v npm &> /dev/null; then
        npm ci --only=production --silent
        log_success "Dependencies installed successfully"
    else
        log_error "npm is not installed"
        exit 1
    fi
}

# Function to run pre-flight checks
run_preflight_checks() {
    log_info "Running pre-flight checks..."
    
    cd "$PROJECT_DIR"
    
    # Test configuration loading
    if ! node -e "require('dotenv').config(); require('./config/production');" 2>/dev/null; then
        log_error "Failed to load production configuration"
        exit 1
    fi
    
    # Test SFMC connectivity (if credentials are provided)
    if [[ -n "${SFMC_CLIENT_ID:-}" && -n "${SFMC_CLIENT_SECRET:-}" ]]; then
        log_info "Testing SFMC connectivity..."
        
        local auth_response=$(curl -s -X POST "${SFMC_AUTH_URL}" \
            -H "Content-Type: application/json" \
            -d "{
                \"grant_type\": \"client_credentials\",
                \"client_id\": \"${SFMC_CLIENT_ID}\",
                \"client_secret\": \"${SFMC_CLIENT_SECRET}\"
            }" 2>/dev/null || echo "")
        
        if [[ -n "$auth_response" ]] && echo "$auth_response" | grep -q "access_token"; then
            log_success "SFMC connectivity test passed"
        else
            log_warning "SFMC connectivity test failed - check credentials"
        fi
    fi
    
    # Test holiday API connectivity
    if [[ "${STO_HOLIDAY_API_ENABLED:-true}" == "true" ]]; then
        log_info "Testing holiday API connectivity..."
        
        local holiday_url="${STO_HOLIDAY_API_URL:-https://date.nager.at/api/v3}"
        if curl -s -f "$holiday_url/PublicHolidays/2024/US" > /dev/null 2>&1; then
            log_success "Holiday API connectivity test passed"
        else
            log_warning "Holiday API connectivity test failed - fallback mode will be used"
        fi
    fi
    
    log_success "Pre-flight checks completed"
}

# Function to start the application
start_application() {
    log_info "Starting Send Time Optimization Activity..."
    
    cd "$PROJECT_DIR"
    
    # Check if already running
    if [[ -f "$PID_FILE" ]]; then
        local existing_pid=$(cat "$PID_FILE")
        if kill -0 "$existing_pid" 2>/dev/null; then
            log_warning "Application is already running with PID $existing_pid"
            return 0
        else
            log_info "Removing stale PID file"
            rm -f "$PID_FILE"
        fi
    fi
    
    # Start the application
    if command -v pm2 &> /dev/null; then
        # Use PM2 if available
        log_info "Starting with PM2..."
        
        # Create PM2 ecosystem file if it doesn't exist
        if [[ ! -f "ecosystem.config.js" ]]; then
            cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'sto-activity',
    script: 'server-production.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    error_file: '$LOG_DIR/error.log',
    out_file: '$LOG_DIR/out.log',
    log_file: '$LOG_DIR/combined.log',
    time: true,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
EOF
        fi
        
        pm2 start ecosystem.config.js
        pm2 save
        
        # Get PID from PM2
        local pm2_pid=$(pm2 jlist | jq -r '.[0].pid' 2>/dev/null || echo "")
        if [[ -n "$pm2_pid" && "$pm2_pid" != "null" ]]; then
            echo "$pm2_pid" > "$PID_FILE"
        fi
        
    else
        # Start directly with Node.js
        log_info "Starting with Node.js..."
        
        nohup node server-production.js > "$LOG_DIR/application.log" 2>&1 &
        local app_pid=$!
        echo "$app_pid" > "$PID_FILE"
        
        # Wait a moment to check if the process started successfully
        sleep 2
        if ! kill -0 "$app_pid" 2>/dev/null; then
            log_error "Failed to start application"
            rm -f "$PID_FILE"
            exit 1
        fi
    fi
    
    log_success "Application started successfully"
}

# Function to verify startup
verify_startup() {
    log_info "Verifying application startup..."
    
    local port="${PORT:-3000}"
    local protocol="http"
    
    if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
        protocol="https"
        port="${PORT:-443}"
    fi
    
    local health_url="${protocol}://localhost:${port}/health"
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts..."
        
        if curl -s -f -k "$health_url" > /dev/null 2>&1; then
            log_success "Application is healthy and responding"
            
            # Get detailed health information
            local health_response=$(curl -s -k "$health_url" 2>/dev/null || echo "{}")
            echo "Health Status: $health_response" | jq '.' 2>/dev/null || echo "$health_response"
            
            return 0
        fi
        
        sleep 2
        ((attempt++))
    done
    
    log_error "Application failed to respond to health checks"
    return 1
}

# Function to display startup summary
display_summary() {
    log_success "=== Send Time Optimization Activity - Production Startup Complete ==="
    
    local port="${PORT:-3000}"
    local protocol="http"
    
    if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
        protocol="https"
        port="${PORT:-443}"
    fi
    
    echo ""
    echo "Application Details:"
    echo "  - Environment: ${NODE_ENV:-production}"
    echo "  - Protocol: $protocol"
    echo "  - Port: $port"
    echo "  - PID File: $PID_FILE"
    echo "  - Log Directory: $LOG_DIR"
    echo ""
    echo "Health Check URLs:"
    echo "  - Basic: ${protocol}://localhost:${port}/health"
    echo "  - Detailed: ${protocol}://localhost:${port}/health/detailed"
    echo "  - Metrics: ${protocol}://localhost:${port}/metrics"
    echo ""
    echo "Management Commands:"
    echo "  - View logs: tail -f $LOG_DIR/*.log"
    echo "  - Stop application: $SCRIPT_DIR/production-shutdown.sh"
    echo "  - Restart application: $SCRIPT_DIR/production-restart.sh"
    
    if command -v pm2 &> /dev/null; then
        echo "  - PM2 status: pm2 status"
        echo "  - PM2 logs: pm2 logs sto-activity"
        echo "  - PM2 monitor: pm2 monit"
    fi
    
    echo ""
}

# Main execution
main() {
    log_info "Starting Send Time Optimization Activity production deployment..."
    
    # Run all startup steps
    check_root
    validate_environment
    check_system_requirements
    setup_directories
    install_dependencies
    run_preflight_checks
    start_application
    
    if verify_startup; then
        display_summary
        log_success "Production startup completed successfully!"
        exit 0
    else
        log_error "Production startup failed during verification"
        exit 1
    fi
}

# Handle script interruption
trap 'log_error "Startup interrupted"; exit 1' INT TERM

# Execute main function
main "$@"