#!/bin/bash

# Production Restart Script for Send Time Optimization Activity
# This script handles graceful restart of the production application

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

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

# Function to perform pre-restart checks
pre_restart_checks() {
    log_info "Performing pre-restart checks..."
    
    # Check if startup script exists
    if [[ ! -f "$SCRIPT_DIR/production-startup.sh" ]]; then
        log_error "Startup script not found: $SCRIPT_DIR/production-startup.sh"
        exit 1
    fi
    
    # Check if shutdown script exists
    if [[ ! -f "$SCRIPT_DIR/production-shutdown.sh" ]]; then
        log_error "Shutdown script not found: $SCRIPT_DIR/production-shutdown.sh"
        exit 1
    fi
    
    # Make scripts executable
    chmod +x "$SCRIPT_DIR/production-startup.sh"
    chmod +x "$SCRIPT_DIR/production-shutdown.sh"
    
    # Check if environment file exists
    if [[ ! -f "$PROJECT_DIR/.env" ]]; then
        log_error "Environment file not found: $PROJECT_DIR/.env"
        log_info "Please copy .env.production to .env and configure it"
        exit 1
    fi
    
    log_success "Pre-restart checks completed"
}

# Function to backup current state
backup_current_state() {
    log_info "Creating backup of current state..."
    
    local backup_dir="$PROJECT_DIR/backups"
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_path="$backup_dir/restart_backup_$timestamp"
    
    # Create backup directory
    mkdir -p "$backup_path"
    
    # Backup configuration files
    cp "$PROJECT_DIR/.env" "$backup_path/" 2>/dev/null || true
    cp -r "$PROJECT_DIR/config" "$backup_path/" 2>/dev/null || true
    
    # Backup logs (last 1000 lines of each log file)
    local log_dir="/var/log/sto-activity"
    if [[ -d "$log_dir" ]]; then
        mkdir -p "$backup_path/logs"
        for log_file in "$log_dir"/*.log; do
            if [[ -f "$log_file" ]]; then
                tail -n 1000 "$log_file" > "$backup_path/logs/$(basename "$log_file")" 2>/dev/null || true
            fi
        done
    fi
    
    # Create backup manifest
    cat > "$backup_path/manifest.txt" << EOF
Backup created: $(date)
Restart initiated by: $USER
Project directory: $PROJECT_DIR
Backup contents:
- Environment configuration (.env)
- Application configuration (config/)
- Recent log files (last 1000 lines)
EOF
    
    log_success "Backup created: $backup_path"
    
    # Cleanup old backups (keep last 5)
    if [[ -d "$backup_dir" ]]; then
        ls -t "$backup_dir" | tail -n +6 | xargs -I {} rm -rf "$backup_dir/{}" 2>/dev/null || true
    fi
}

# Function to perform graceful restart
perform_restart() {
    log_info "Performing graceful restart..."
    
    # Step 1: Shutdown the application
    log_info "Step 1: Shutting down application..."
    if "$SCRIPT_DIR/production-shutdown.sh"; then
        log_success "Application shutdown completed"
    else
        log_error "Application shutdown failed"
        return 1
    fi
    
    # Step 2: Wait a moment for cleanup
    log_info "Waiting for cleanup to complete..."
    sleep 3
    
    # Step 3: Start the application
    log_info "Step 2: Starting application..."
    if "$SCRIPT_DIR/production-startup.sh"; then
        log_success "Application startup completed"
        return 0
    else
        log_error "Application startup failed"
        return 1
    fi
}

# Function to perform rolling restart (if PM2 is available)
perform_rolling_restart() {
    log_info "Performing rolling restart with PM2..."
    
    if command -v pm2 &> /dev/null; then
        # Check if PM2 process exists
        if pm2 list | grep -q "sto-activity"; then
            log_info "Performing PM2 rolling restart..."
            
            # Reload the application (zero-downtime restart)
            if pm2 reload sto-activity; then
                log_success "PM2 rolling restart completed"
                return 0
            else
                log_error "PM2 rolling restart failed"
                return 1
            fi
        else
            log_warning "No PM2 application found, falling back to graceful restart"
            return 1
        fi
    else
        log_warning "PM2 not available, falling back to graceful restart"
        return 1
    fi
}

# Function to verify restart
verify_restart() {
    log_info "Verifying restart..."
    
    local port="${PORT:-3000}"
    local protocol="http"
    
    # Load environment to get correct port and protocol
    if [[ -f "$PROJECT_DIR/.env" ]]; then
        set -a
        source "$PROJECT_DIR/.env"
        set +a
        
        if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
            protocol="https"
            port="${PORT:-443}"
        fi
    fi
    
    local health_url="${protocol}://localhost:${port}/health"
    local max_attempts=20
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_info "Health check attempt $attempt/$max_attempts..."
        
        if curl -s -f -k "$health_url" > /dev/null 2>&1; then
            log_success "Application is healthy after restart"
            
            # Get detailed health information
            local health_response=$(curl -s -k "$health_url" 2>/dev/null || echo "{}")
            echo "Health Status: $health_response" | jq '.' 2>/dev/null || echo "$health_response"
            
            return 0
        fi
        
        sleep 3
        ((attempt++))
    done
    
    log_error "Application failed to respond to health checks after restart"
    return 1
}

# Function to display restart summary
display_summary() {
    log_success "=== Send Time Optimization Activity - Production Restart Complete ==="
    
    local port="${PORT:-3000}"
    local protocol="http"
    
    # Load environment to get correct port and protocol
    if [[ -f "$PROJECT_DIR/.env" ]]; then
        set -a
        source "$PROJECT_DIR/.env"
        set +a
        
        if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
            protocol="https"
            port="${PORT:-443}"
        fi
    fi
    
    echo ""
    echo "Restart Summary:"
    echo "  - Application successfully restarted"
    echo "  - Health checks passed"
    echo "  - Service is available at: ${protocol}://localhost:${port}"
    echo ""
    echo "Health Check URLs:"
    echo "  - Basic: ${protocol}://localhost:${port}/health"
    echo "  - Detailed: ${protocol}://localhost:${port}/health/detailed"
    echo "  - Metrics: ${protocol}://localhost:${port}/metrics"
    echo ""
    echo "Management Commands:"
    echo "  - View logs: tail -f /var/log/sto-activity/*.log"
    echo "  - Stop application: $SCRIPT_DIR/production-shutdown.sh"
    
    if command -v pm2 &> /dev/null; then
        echo "  - PM2 status: pm2 status"
        echo "  - PM2 logs: pm2 logs sto-activity"
        echo "  - PM2 monitor: pm2 monit"
    fi
    
    echo ""
}

# Main execution
main() {
    local restart_type="${1:-graceful}"
    
    log_info "Starting Send Time Optimization Activity restart (type: $restart_type)..."
    
    # Perform pre-restart checks
    pre_restart_checks
    
    # Create backup
    backup_current_state
    
    # Perform restart based on type
    local restart_success=false
    
    case "$restart_type" in
        "rolling")
            if perform_rolling_restart; then
                restart_success=true
            else
                log_warning "Rolling restart failed, attempting graceful restart..."
                if perform_restart; then
                    restart_success=true
                fi
            fi
            ;;
        "graceful"|*)
            if perform_restart; then
                restart_success=true
            fi
            ;;
    esac
    
    if [[ "$restart_success" == "true" ]]; then
        # Verify restart
        if verify_restart; then
            display_summary
            log_success "Production restart completed successfully!"
            exit 0
        else
            log_error "Restart verification failed"
            exit 1
        fi
    else
        log_error "Restart failed"
        exit 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [restart_type]"
    echo ""
    echo "Restart types:"
    echo "  graceful  - Stop and start the application (default)"
    echo "  rolling   - Zero-downtime restart using PM2 (if available)"
    echo ""
    echo "Examples:"
    echo "  $0                # Graceful restart"
    echo "  $0 graceful       # Graceful restart"
    echo "  $0 rolling        # Rolling restart (PM2 required)"
    echo ""
}

# Handle command line arguments
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    show_usage
    exit 0
fi

# Handle script interruption
trap 'log_error "Restart interrupted"; exit 1' INT TERM

# Execute main function
main "$@"