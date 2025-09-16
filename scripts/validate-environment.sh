#!/bin/bash

# Environment Validation Script for Send Time Optimization Activity
# This script validates all environment variables and configuration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
ERRORS=0
WARNINGS=0
CHECKS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARNINGS++))
    ((CHECKS++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((ERRORS++))
    ((CHECKS++))
}

# Function to check if environment file exists
check_env_file() {
    log_info "Checking environment file..."
    
    if [[ -f "$ENV_FILE" ]]; then
        log_success "Environment file exists: $ENV_FILE"
        
        # Check file permissions
        local perms=$(stat -c "%a" "$ENV_FILE" 2>/dev/null || stat -f "%A" "$ENV_FILE" 2>/dev/null || echo "unknown")
        if [[ "$perms" == "600" || "$perms" == "0600" ]]; then
            log_success "Environment file has secure permissions: $perms"
        else
            log_warning "Environment file permissions should be 600 (current: $perms)"
        fi
        
        return 0
    else
        log_error "Environment file not found: $ENV_FILE"
        log_info "Please copy .env.production to .env and configure it"
        return 1
    fi
}

# Function to load environment variables
load_environment() {
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
        log_success "Environment variables loaded"
        return 0
    else
        return 1
    fi
}

# Function to validate required variables
validate_required_variables() {
    log_info "Validating required environment variables..."
    
    local required_vars=(
        "NODE_ENV:Environment type (development, production, test)"
        "JWT_SECRET:JWT secret key for token validation"
        "SFMC_CLIENT_ID:Salesforce Marketing Cloud Client ID"
        "SFMC_CLIENT_SECRET:Salesforce Marketing Cloud Client Secret"
        "SFMC_SUBDOMAIN:SFMC subdomain"
        "SFMC_ACCOUNT_ID:SFMC Account ID"
        "APP_EXTENSION_KEY:SFMC App Extension Key"
    )
    
    for var_info in "${required_vars[@]}"; do
        local var_name="${var_info%%:*}"
        local var_desc="${var_info##*:}"
        local var_value="${!var_name:-}"
        
        if [[ -n "$var_value" ]]; then
            log_success "$var_name is set ($var_desc)"
        else
            log_error "$var_name is not set ($var_desc)"
        fi
    done
}

# Function to validate JWT secret
validate_jwt_secret() {
    log_info "Validating JWT configuration..."
    
    if [[ -n "${JWT_SECRET:-}" ]]; then
        local secret_length=${#JWT_SECRET}
        
        if [[ $secret_length -ge 32 ]]; then
            log_success "JWT_SECRET has adequate length ($secret_length characters)"
        else
            log_error "JWT_SECRET must be at least 32 characters long (current: $secret_length)"
        fi
        
        # Check for common weak secrets
        local weak_secrets=("secret" "password" "123456" "test" "development" "changeme")
        for weak in "${weak_secrets[@]}"; do
            if [[ "$JWT_SECRET" == *"$weak"* ]]; then
                log_warning "JWT_SECRET contains common weak pattern: $weak"
                break
            fi
        done
        
        # Check JWT issuer and audience
        if [[ -n "${JWT_ISSUER:-}" ]]; then
            log_success "JWT_ISSUER is configured: ${JWT_ISSUER}"
        else
            log_warning "JWT_ISSUER is not set (will use default)"
        fi
        
        if [[ -n "${JWT_AUDIENCE:-}" ]]; then
            log_success "JWT_AUDIENCE is configured: ${JWT_AUDIENCE}"
        else
            log_warning "JWT_AUDIENCE is not set (will use default)"
        fi
    else
        log_error "JWT_SECRET is not set"
    fi
}

# Function to validate SSL configuration
validate_ssl_configuration() {
    log_info "Validating SSL/TLS configuration..."
    
    local ssl_enabled="${SSL_ENABLED:-false}"
    
    if [[ "$ssl_enabled" == "true" ]]; then
        log_info "SSL is enabled, validating certificate files..."
        
        # Check SSL key file
        if [[ -n "${SSL_KEY_PATH:-}" ]]; then
            if [[ -f "$SSL_KEY_PATH" ]]; then
                log_success "SSL key file exists: $SSL_KEY_PATH"
                
                # Check key file permissions
                local key_perms=$(stat -c "%a" "$SSL_KEY_PATH" 2>/dev/null || stat -f "%A" "$SSL_KEY_PATH" 2>/dev/null || echo "unknown")
                if [[ "$key_perms" == "600" || "$key_perms" == "0600" ]]; then
                    log_success "SSL key file has secure permissions: $key_perms"
                else
                    log_warning "SSL key file should have 600 permissions (current: $key_perms)"
                fi
                
                # Validate key file format
                if openssl rsa -in "$SSL_KEY_PATH" -check -noout > /dev/null 2>&1; then
                    log_success "SSL key file is valid"
                else
                    log_error "SSL key file is invalid or corrupted"
                fi
            else
                log_error "SSL key file not found: $SSL_KEY_PATH"
            fi
        else
            log_error "SSL_KEY_PATH is not set but SSL is enabled"
        fi
        
        # Check SSL certificate file
        if [[ -n "${SSL_CERT_PATH:-}" ]]; then
            if [[ -f "$SSL_CERT_PATH" ]]; then
                log_success "SSL certificate file exists: $SSL_CERT_PATH"
                
                # Validate certificate
                if openssl x509 -in "$SSL_CERT_PATH" -noout -text > /dev/null 2>&1; then
                    log_success "SSL certificate file is valid"
                    
                    # Check certificate expiration
                    local cert_end_date=$(openssl x509 -in "$SSL_CERT_PATH" -noout -enddate | cut -d= -f2)
                    local cert_end_epoch=$(date -d "$cert_end_date" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$cert_end_date" +%s 2>/dev/null || echo "0")
                    local current_epoch=$(date +%s)
                    local days_until_expiry=$(( (cert_end_epoch - current_epoch) / 86400 ))
                    
                    if [[ $days_until_expiry -gt 30 ]]; then
                        log_success "SSL certificate is valid for $days_until_expiry more days"
                    elif [[ $days_until_expiry -gt 0 ]]; then
                        log_warning "SSL certificate expires in $days_until_expiry days"
                    else
                        log_error "SSL certificate has expired"
                    fi
                else
                    log_error "SSL certificate file is invalid or corrupted"
                fi
            else
                log_error "SSL certificate file not found: $SSL_CERT_PATH"
            fi
        else
            log_error "SSL_CERT_PATH is not set but SSL is enabled"
        fi
        
        # Check CA certificate file (optional)
        if [[ -n "${SSL_CA_PATH:-}" ]]; then
            if [[ -f "$SSL_CA_PATH" ]]; then
                log_success "SSL CA file exists: $SSL_CA_PATH"
                
                if openssl x509 -in "$SSL_CA_PATH" -noout -text > /dev/null 2>&1; then
                    log_success "SSL CA file is valid"
                else
                    log_warning "SSL CA file appears to be invalid"
                fi
            else
                log_warning "SSL CA file not found: $SSL_CA_PATH"
            fi
        fi
        
        # Validate port configuration
        local port="${PORT:-443}"
        if [[ "$port" == "443" ]]; then
            log_success "Using standard HTTPS port: $port"
        else
            log_warning "Using non-standard HTTPS port: $port"
        fi
        
    else
        log_info "SSL is disabled"
        
        local port="${PORT:-3000}"
        if [[ "$port" == "80" || "$port" == "3000" ]]; then
            log_success "Using appropriate HTTP port: $port"
        else
            log_warning "Using non-standard HTTP port: $port"
        fi
    fi
}

# Function to validate SFMC configuration
validate_sfmc_configuration() {
    log_info "Validating SFMC configuration..."
    
    # Validate SFMC URLs
    if [[ -n "${SFMC_AUTH_URL:-}" ]]; then
        if [[ "$SFMC_AUTH_URL" =~ ^https://.*\.auth\.marketingcloudapis\.com/v2/token$ ]]; then
            log_success "SFMC_AUTH_URL format is correct"
        else
            log_warning "SFMC_AUTH_URL format may be incorrect: $SFMC_AUTH_URL"
        fi
    else
        log_error "SFMC_AUTH_URL is not set"
    fi
    
    if [[ -n "${SFMC_REST_BASE_URL:-}" ]]; then
        if [[ "$SFMC_REST_BASE_URL" =~ ^https://.*\.rest\.marketingcloudapis\.com$ ]]; then
            log_success "SFMC_REST_BASE_URL format is correct"
        else
            log_warning "SFMC_REST_BASE_URL format may be incorrect: $SFMC_REST_BASE_URL"
        fi
    else
        log_error "SFMC_REST_BASE_URL is not set"
    fi
    
    # Validate subdomain consistency
    if [[ -n "${SFMC_SUBDOMAIN:-}" && -n "${SFMC_AUTH_URL:-}" ]]; then
        if [[ "$SFMC_AUTH_URL" == *"$SFMC_SUBDOMAIN"* ]]; then
            log_success "SFMC subdomain is consistent with auth URL"
        else
            log_warning "SFMC subdomain may not match auth URL"
        fi
    fi
    
    # Validate timeout settings
    local api_timeout="${SFMC_API_TIMEOUT:-30000}"
    if [[ $api_timeout -ge 5000 && $api_timeout -le 60000 ]]; then
        log_success "SFMC API timeout is reasonable: ${api_timeout}ms"
    else
        log_warning "SFMC API timeout may be too low or high: ${api_timeout}ms"
    fi
    
    # Validate retry settings
    local api_retries="${SFMC_API_RETRIES:-3}"
    if [[ $api_retries -ge 1 && $api_retries -le 5 ]]; then
        log_success "SFMC API retry count is reasonable: $api_retries"
    else
        log_warning "SFMC API retry count may be inappropriate: $api_retries"
    fi
}

# Function to validate STO configuration
validate_sto_configuration() {
    log_info "Validating Send Time Optimization configuration..."
    
    # Validate default timezone
    local default_tz="${STO_DEFAULT_TIMEZONE:-America/Chicago}"
    if [[ -f "/usr/share/zoneinfo/$default_tz" ]] || [[ -f "/usr/share/zoneinfo.default/$default_tz" ]]; then
        log_success "Default timezone is valid: $default_tz"
    else
        log_warning "Default timezone may be invalid: $default_tz"
    fi
    
    # Validate processing time
    local max_processing_time="${STO_MAX_PROCESSING_TIME:-20000}"
    if [[ $max_processing_time -ge 5000 && $max_processing_time -le 30000 ]]; then
        log_success "Max processing time is reasonable: ${max_processing_time}ms"
    else
        log_warning "Max processing time may be inappropriate: ${max_processing_time}ms"
    fi
    
    # Validate batch size
    local batch_size="${STO_BATCH_SIZE:-100}"
    if [[ $batch_size -ge 1 && $batch_size -le 1000 ]]; then
        log_success "Batch size is reasonable: $batch_size"
    else
        log_warning "Batch size may be inappropriate: $batch_size"
    fi
    
    # Validate supported countries
    if [[ -n "${STO_SUPPORTED_COUNTRIES:-}" ]]; then
        local country_count=$(echo "$STO_SUPPORTED_COUNTRIES" | tr ',' '\n' | wc -l)
        if [[ $country_count -ge 5 ]]; then
            log_success "Supported countries configured: $country_count countries"
        else
            log_warning "Limited supported countries: $country_count countries"
        fi
    else
        log_warning "STO_SUPPORTED_COUNTRIES not set (will use defaults)"
    fi
}

# Function to validate holiday API configuration
validate_holiday_api_configuration() {
    log_info "Validating Holiday API configuration..."
    
    local holiday_api_enabled="${STO_HOLIDAY_API_ENABLED:-true}"
    
    if [[ "$holiday_api_enabled" == "true" ]]; then
        # Validate holiday API URL
        local holiday_api_url="${STO_HOLIDAY_API_URL:-https://date.nager.at/api/v3}"
        if [[ "$holiday_api_url" =~ ^https?:// ]]; then
            log_success "Holiday API URL format is correct: $holiday_api_url"
            
            # Test connectivity (if curl is available)
            if command -v curl &> /dev/null; then
                log_info "Testing holiday API connectivity..."
                if curl -s -f --connect-timeout 10 "$holiday_api_url/PublicHolidays/2024/US" > /dev/null 2>&1; then
                    log_success "Holiday API is accessible"
                else
                    log_warning "Holiday API is not accessible (fallback will be used)"
                fi
            fi
        else
            log_error "Holiday API URL format is invalid: $holiday_api_url"
        fi
        
        # Validate timeout settings
        local holiday_timeout="${HOLIDAY_API_TIMEOUT:-10000}"
        if [[ $holiday_timeout -ge 5000 && $holiday_timeout -le 30000 ]]; then
            log_success "Holiday API timeout is reasonable: ${holiday_timeout}ms"
        else
            log_warning "Holiday API timeout may be inappropriate: ${holiday_timeout}ms"
        fi
        
        # Check fallback configuration
        local fallback_enabled="${HOLIDAY_API_FALLBACK_ENABLED:-true}"
        if [[ "$fallback_enabled" == "true" ]]; then
            log_success "Holiday API fallback is enabled"
            
            local fallback_path="${HOLIDAY_FALLBACK_DATA_PATH:-./data/holidays}"
            if [[ -d "$fallback_path" ]]; then
                log_success "Holiday fallback data directory exists: $fallback_path"
            else
                log_warning "Holiday fallback data directory not found: $fallback_path"
            fi
        else
            log_warning "Holiday API fallback is disabled"
        fi
    else
        log_info "Holiday API is disabled"
    fi
}

# Function to validate caching configuration
validate_caching_configuration() {
    log_info "Validating caching configuration..."
    
    # Validate holiday cache settings
    local holiday_cache_ttl="${HOLIDAY_CACHE_TTL:-86400}"
    if [[ $holiday_cache_ttl -ge 3600 && $holiday_cache_ttl -le 604800 ]]; then
        log_success "Holiday cache TTL is reasonable: ${holiday_cache_ttl}s"
    else
        log_warning "Holiday cache TTL may be inappropriate: ${holiday_cache_ttl}s"
    fi
    
    local holiday_cache_max_keys="${HOLIDAY_CACHE_MAX_KEYS:-1000}"
    if [[ $holiday_cache_max_keys -ge 100 && $holiday_cache_max_keys -le 10000 ]]; then
        log_success "Holiday cache max keys is reasonable: $holiday_cache_max_keys"
    else
        log_warning "Holiday cache max keys may be inappropriate: $holiday_cache_max_keys"
    fi
    
    # Validate timezone cache settings
    local timezone_cache_ttl="${TIMEZONE_CACHE_TTL:-3600}"
    if [[ $timezone_cache_ttl -ge 1800 && $timezone_cache_ttl -le 86400 ]]; then
        log_success "Timezone cache TTL is reasonable: ${timezone_cache_ttl}s"
    else
        log_warning "Timezone cache TTL may be inappropriate: ${timezone_cache_ttl}s"
    fi
    
    # Validate token cache settings
    local token_cache_ttl="${TOKEN_CACHE_TTL:-3300}"
    if [[ $token_cache_ttl -ge 1800 && $token_cache_ttl -le 3600 ]]; then
        log_success "Token cache TTL is reasonable: ${token_cache_ttl}s"
    else
        log_warning "Token cache TTL may be inappropriate: ${token_cache_ttl}s"
    fi
}

# Function to validate logging configuration
validate_logging_configuration() {
    log_info "Validating logging configuration..."
    
    # Validate log level
    local log_level="${LOG_LEVEL:-info}"
    local valid_levels=("error" "warn" "info" "debug")
    if [[ " ${valid_levels[@]} " =~ " $log_level " ]]; then
        log_success "Log level is valid: $log_level"
    else
        log_warning "Log level may be invalid: $log_level"
    fi
    
    # Validate file logging
    local file_logging="${FILE_LOGGING_ENABLED:-true}"
    if [[ "$file_logging" == "true" ]]; then
        local log_path="${LOG_FILE_PATH:-/var/log/sto-activity}"
        
        # Check if log directory exists or can be created
        if [[ -d "$log_path" ]]; then
            log_success "Log directory exists: $log_path"
            
            # Check write permissions
            if [[ -w "$log_path" ]]; then
                log_success "Log directory is writable"
            else
                log_error "Log directory is not writable: $log_path"
            fi
        else
            # Try to create the directory
            if mkdir -p "$log_path" 2>/dev/null; then
                log_success "Log directory created: $log_path"
            else
                log_error "Cannot create log directory: $log_path"
            fi
        fi
        
        # Validate log rotation settings
        local max_size="${LOG_MAX_SIZE:-100MB}"
        local max_files="${LOG_MAX_FILES:-10}"
        
        log_success "Log rotation configured: max size $max_size, max files $max_files"
    else
        log_info "File logging is disabled"
    fi
}

# Function to validate security configuration
validate_security_configuration() {
    log_info "Validating security configuration..."
    
    # Validate CORS origins
    if [[ -n "${ALLOWED_ORIGINS:-}" ]]; then
        local origin_count=$(echo "$ALLOWED_ORIGINS" | tr ',' '\n' | wc -l)
        log_success "CORS origins configured: $origin_count origins"
        
        # Check for wildcard origins in production
        if [[ "$NODE_ENV" == "production" && "$ALLOWED_ORIGINS" == *"*"* ]]; then
            log_warning "Wildcard CORS origins detected in production environment"
        fi
    else
        log_warning "ALLOWED_ORIGINS not set (will use defaults)"
    fi
    
    # Validate rate limiting
    local rate_limit_window="${RATE_LIMIT_WINDOW:-900000}"
    local rate_limit_max="${RATE_LIMIT_MAX:-1000}"
    
    if [[ $rate_limit_window -ge 60000 && $rate_limit_window -le 3600000 ]]; then
        log_success "Rate limit window is reasonable: ${rate_limit_window}ms"
    else
        log_warning "Rate limit window may be inappropriate: ${rate_limit_window}ms"
    fi
    
    if [[ $rate_limit_max -ge 100 && $rate_limit_max -le 10000 ]]; then
        log_success "Rate limit max is reasonable: $rate_limit_max"
    else
        log_warning "Rate limit max may be inappropriate: $rate_limit_max"
    fi
}

# Function to test configuration loading
test_configuration_loading() {
    log_info "Testing configuration loading..."
    
    cd "$PROJECT_DIR"
    
    # Test Node.js configuration loading
    if node -e "
        require('dotenv').config();
        const config = require('./config/production');
        console.log('Configuration loaded successfully');
    " > /dev/null 2>&1; then
        log_success "Production configuration loads successfully"
    else
        log_error "Failed to load production configuration"
    fi
    
    # Test security configuration loading
    if node -e "
        require('dotenv').config();
        const SecurityConfig = require('./config/security');
        const config = require('./config/production');
        const securityConfig = new SecurityConfig(config.security);
        console.log('Security configuration loaded successfully');
    " > /dev/null 2>&1; then
        log_success "Security configuration loads successfully"
    else
        log_error "Failed to load security configuration"
    fi
}

# Function to display validation summary
display_summary() {
    echo ""
    echo "=== Environment Validation Summary ==="
    echo ""
    echo "Total checks performed: $CHECKS"
    echo -e "Passed: ${GREEN}$((CHECKS - WARNINGS - ERRORS))${NC}"
    echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
    echo -e "Errors: ${RED}$ERRORS${NC}"
    echo ""
    
    if [[ $ERRORS -eq 0 ]]; then
        if [[ $WARNINGS -eq 0 ]]; then
            echo -e "${GREEN}✓ Environment validation passed with no issues${NC}"
            echo "The application is ready for production deployment."
        else
            echo -e "${YELLOW}⚠ Environment validation passed with warnings${NC}"
            echo "Please review the warnings above before deployment."
        fi
        echo ""
        return 0
    else
        echo -e "${RED}✗ Environment validation failed${NC}"
        echo "Please fix the errors above before deployment."
        echo ""
        return 1
    fi
}

# Main execution
main() {
    echo "=== Send Time Optimization Activity - Environment Validation ==="
    echo ""
    
    # Check environment file and load variables
    if ! check_env_file || ! load_environment; then
        echo ""
        echo -e "${RED}Cannot proceed without valid environment file${NC}"
        exit 1
    fi
    
    echo ""
    
    # Run all validation checks
    validate_required_variables
    validate_jwt_secret
    validate_ssl_configuration
    validate_sfmc_configuration
    validate_sto_configuration
    validate_holiday_api_configuration
    validate_caching_configuration
    validate_logging_configuration
    validate_security_configuration
    test_configuration_loading
    
    # Display summary and exit with appropriate code
    if display_summary; then
        exit 0
    else
        exit 1
    fi
}

# Execute main function
main "$@"