#!/bin/bash

# Production Shutdown Script for Send Time Optimization Activity
# This script handles graceful shutdown of the production application

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="/var/run/sto-activity.pid"
LOG_DIR="/var/log/sto-activity"

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

# Function to stop PM2 application
stop_pm2_application() {
    log_info "Stopping PM2 application..."
    
    if command -v pm2 &> /dev/null; then
        # Check if PM2 process exists
        if pm2 list | grep -q "sto-activity"; then
            log_info "Gracefully stopping PM2 application..."
            pm2 stop sto-activity
            
            # Wait for graceful shutdown
            sleep 5
            
            # Delete the application from PM2
            pm2 delete sto-activity
            
            log_success "PM2 application stopped successfully"
            return 0
        else
            log_warning "No PM2 application named 'sto-activity' found"
            return 1
        fi
    else
        log_warning "PM2 not found"
        return 1
    fi
}

# Function to stop Node.js process
stop_nodejs_process() {
    log_info "Stopping Node.js process..."
    
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        
        if kill -0 "$pid" 2>/dev/null; then
            log_info "Sending SIGTERM to process $pid..."
            kill -TERM "$pid"
            
            # Wait for graceful shutdown (up to 30 seconds)
            local count=0
            while kill -0 "$pid" 2>/dev/null && [[ $count -lt 30 ]]; do
                sleep 1
                ((count++))
                if [[ $((count % 5)) -eq 0 ]]; then
                    log_info "Waiting for graceful shutdown... ($count/30 seconds)"
                fi
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warning "Process did not shut down gracefully, forcing termination..."
                kill -KILL "$pid"
                sleep 2
            fi
            
            # Verify process is stopped
            if ! kill -0 "$pid" 2>/dev/null; then
                log_success "Process $pid stopped successfully"
                rm -f "$PID_FILE"
                return 0
            else
                log_error "Failed to stop process $pid"
                return 1
            fi
        else
            log_warning "Process $pid is not running"
            rm -f "$PID_FILE"
            return 0
        fi
    else
        log_warning "PID file not found: $PID_FILE"
        return 1
    fi
}

# Function to find and stop any running instances
stop_any_running_instances() {
    log_info "Searching for any running instances..."
    
    # Find processes by name
    local pids=$(pgrep -f "server-production.js" || true)
    
    if [[ -n "$pids" ]]; then
        log_info "Found running instances with PIDs: $pids"
        
        for pid in $pids; do
            log_info "Stopping process $pid..."
            
            # Send SIGTERM
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [[ $count -lt 15 ]]; do
                sleep 1
                ((count++))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warning "Force killing process $pid..."
                kill -KILL "$pid" 2>/dev/null || true
            fi
            
            if ! kill -0 "$pid" 2>/dev/null; then
                log_success "Process $pid stopped"
            else
                log_error "Failed to stop process $pid"
            fi
        done
    else
        log_info "No running instances found"
    fi
}

# Function to cleanup resources
cleanup_resources() {
    log_info "Cleaning up resources..."
    
    # Remove PID file if it exists
    if [[ -f "$PID_FILE" ]]; then
        rm -f "$PID_FILE"
        log_info "Removed PID file"
    fi
    
    # Clean up temporary files
    local temp_files=(
        "$PROJECT_DIR/tmp/*"
        "$PROJECT_DIR/*.tmp"
        "/tmp/sto-activity-*"
    )
    
    for pattern in "${temp_files[@]}"; do
        if ls $pattern 1> /dev/null 2>&1; then
            rm -f $pattern
            log_info "Cleaned up temporary files: $pattern"
        fi
    done
    
    # Rotate logs if they're large
    if [[ -d "$LOG_DIR" ]]; then
        find "$LOG_DIR" -name "*.log" -size +100M -exec gzip {} \; 2>/dev/null || true
        log_info "Compressed large log files"
    fi
    
    log_success "Resource cleanup completed"
}

# Function to verify shutdown
verify_shutdown() {
    log_info "Verifying application shutdown..."
    
    # Check for any remaining processes
    local remaining_pids=$(pgrep -f "server-production.js" || true)
    
    if [[ -n "$remaining_pids" ]]; then
        log_error "Some processes are still running: $remaining_pids"
        return 1
    fi
    
    # Check if ports are still in use
    local port="${PORT:-3000}"
    if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
        port="${PORT:-443}"
    fi
    
    if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
        log_warning "Port $port is still in use"
        return 1
    fi
    
    log_success "Application shutdown verified"
    return 0
}

# Function to display shutdown summary
display_summary() {
    log_success "=== Send Time Optimization Activity - Production Shutdown Complete ==="
    
    echo ""
    echo "Shutdown Summary:"
    echo "  - All application processes stopped"
    echo "  - Resources cleaned up"
    echo "  - PID file removed"
    echo "  - Ports released"
    echo ""
    echo "Log files are preserved in: $LOG_DIR"
    echo ""
    echo "To restart the application:"
    echo "  $SCRIPT_DIR/production-startup.sh"
    echo ""
}

# Main execution
main() {
    log_info "Starting Send Time Optimization Activity shutdown..."
    
    local shutdown_success=false
    
    # Try PM2 shutdown first
    if stop_pm2_application; then
        shutdown_success=true
    fi
    
    # Try Node.js process shutdown
    if stop_nodejs_process; then
        shutdown_success=true
    fi
    
    # Find and stop any remaining instances
    stop_any_running_instances
    
    # Cleanup resources
    cleanup_resources
    
    # Verify shutdown
    if verify_shutdown; then
        display_summary
        log_success "Production shutdown completed successfully!"
        exit 0
    else
        log_error "Shutdown verification failed - some processes may still be running"
        exit 1
    fi
}

# Handle script interruption
trap 'log_error "Shutdown interrupted"; exit 1' INT TERM

# Execute main function
main "$@"