#!/bin/bash

# Environment Management Script for Send Time Optimization Activity
# This script helps manage environment variables and configuration

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_TEMPLATE="$PROJECT_DIR/.env.production"
ENV_FILE="$PROJECT_DIR/.env"
BACKUP_DIR="$PROJECT_DIR/backups/env"

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

# Function to show usage
show_usage() {
    echo "Environment Management for Send Time Optimization Activity"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  init                    Initialize environment from template"
    echo "  backup                  Backup current environment"
    echo "  restore [backup]        Restore environment from backup"
    echo "  validate                Validate current environment"
    echo "  update [key] [value]    Update environment variable"
    echo "  generate-secrets        Generate secure secrets"
    echo "  migrate                 Migrate environment to new format"
    echo "  compare                 Compare current env with template"
    echo "  export [format]         Export environment (json, yaml, docker)"
    echo "  import [file]           Import environment from file"
    echo ""
    echo "Examples:"
    echo "  $0 init"
    echo "  $0 backup"
    echo "  $0 update JWT_SECRET \$(openssl rand -hex 32)"
    echo "  $0 generate-secrets"
    echo "  $0 export json > config.json"
    echo ""
}

# Function to initialize environment from template
init_environment() {
    log_info "Initializing environment from template..."
    
    if [[ ! -f "$ENV_TEMPLATE" ]]; then
        log_error "Environment template not found: $ENV_TEMPLATE"
        return 1
    fi
    
    if [[ -f "$ENV_FILE" ]]; then
        log_warning "Environment file already exists: $ENV_FILE"
        read -p "Overwrite existing environment file? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Environment initialization cancelled"
            return 0
        fi
        
        # Backup existing file
        backup_environment
    fi
    
    # Copy template to environment file
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    
    log_success "Environment initialized from template"
    log_info "Please edit $ENV_FILE and configure the required values"
    
    # Show required variables that need configuration
    show_required_variables
}

# Function to backup environment
backup_environment() {
    log_info "Creating environment backup..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        return 1
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Create backup with timestamp
    local timestamp=$(date '+%Y%m%d_%H%M%S')
    local backup_file="$BACKUP_DIR/env_backup_$timestamp"
    
    cp "$ENV_FILE" "$backup_file"
    
    # Create backup manifest
    cat > "$backup_file.manifest" << EOF
Backup created: $(date)
Original file: $ENV_FILE
Backup file: $backup_file
Created by: $USER
Host: $(hostname)
Git commit: $(git rev-parse HEAD 2>/dev/null || echo "N/A")
EOF
    
    log_success "Environment backed up to: $backup_file"
    
    # Cleanup old backups (keep last 10)
    ls -t "$BACKUP_DIR"/env_backup_* | tail -n +11 | xargs rm -f 2>/dev/null || true
    
    echo "$backup_file"
}

# Function to restore environment from backup
restore_environment() {
    local backup_file="$1"
    
    log_info "Restoring environment from backup..."
    
    if [[ -z "$backup_file" ]]; then
        # Show available backups
        log_info "Available backups:"
        ls -la "$BACKUP_DIR"/env_backup_* 2>/dev/null | tail -10 || {
            log_error "No backups found in $BACKUP_DIR"
            return 1
        }
        
        echo ""
        read -p "Enter backup filename: " backup_file
    fi
    
    # Handle relative paths
    if [[ ! "$backup_file" =~ ^/ ]]; then
        backup_file="$BACKUP_DIR/$backup_file"
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Backup current environment before restore
    if [[ -f "$ENV_FILE" ]]; then
        local current_backup=$(backup_environment)
        log_info "Current environment backed up to: $current_backup"
    fi
    
    # Restore from backup
    cp "$backup_file" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    
    log_success "Environment restored from: $backup_file"
    
    # Show manifest if available
    if [[ -f "$backup_file.manifest" ]]; then
        echo ""
        echo "Backup manifest:"
        cat "$backup_file.manifest"
    fi
}

# Function to validate environment
validate_environment() {
    log_info "Validating environment configuration..."
    
    if [[ -f "$SCRIPT_DIR/validate-environment.sh" ]]; then
        "$SCRIPT_DIR/validate-environment.sh"
    else
        log_warning "Environment validation script not found"
        
        # Basic validation
        if [[ ! -f "$ENV_FILE" ]]; then
            log_error "Environment file not found: $ENV_FILE"
            return 1
        fi
        
        # Check required variables
        local required_vars=(
            "NODE_ENV"
            "JWT_SECRET"
            "SFMC_CLIENT_ID"
            "SFMC_CLIENT_SECRET"
            "SFMC_SUBDOMAIN"
            "SFMC_ACCOUNT_ID"
            "APP_EXTENSION_KEY"
        )
        
        set -a
        source "$ENV_FILE"
        set +a
        
        local missing_vars=()
        for var in "${required_vars[@]}"; do
            if [[ -z "${!var:-}" ]]; then
                missing_vars+=("$var")
            fi
        done
        
        if [[ ${#missing_vars[@]} -gt 0 ]]; then
            log_error "Missing required variables:"
            for var in "${missing_vars[@]}"; do
                log_error "  - $var"
            done
            return 1
        else
            log_success "Basic validation passed"
        fi
    fi
}

# Function to update environment variable
update_environment_variable() {
    local key="$1"
    local value="$2"
    
    log_info "Updating environment variable: $key"
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        return 1
    fi
    
    # Backup before update
    backup_environment > /dev/null
    
    # Update or add the variable
    if grep -q "^$key=" "$ENV_FILE"; then
        # Update existing variable
        sed -i.tmp "s|^$key=.*|$key=$value|" "$ENV_FILE"
        log_success "Updated existing variable: $key"
    else
        # Add new variable
        echo "$key=$value" >> "$ENV_FILE"
        log_success "Added new variable: $key"
    fi
    
    # Remove temporary file
    rm -f "$ENV_FILE.tmp"
    
    # Validate the change
    if grep -q "^$key=$value" "$ENV_FILE"; then
        log_success "Variable update verified"
    else
        log_error "Variable update failed"
        return 1
    fi
}

# Function to generate secure secrets
generate_secrets() {
    log_info "Generating secure secrets..."
    
    # Generate JWT secret
    local jwt_secret=$(openssl rand -hex 32)
    log_success "Generated JWT_SECRET (64 characters)"
    
    # Generate API keys
    local api_key=$(openssl rand -hex 16)
    log_success "Generated API_KEY (32 characters)"
    
    # Generate encryption key
    local encryption_key=$(openssl rand -hex 32)
    log_success "Generated ENCRYPTION_KEY (64 characters)"
    
    # Generate session secret
    local session_secret=$(openssl rand -hex 24)
    log_success "Generated SESSION_SECRET (48 characters)"
    
    echo ""
    echo "Generated secrets (copy these to your environment file):"
    echo "JWT_SECRET=$jwt_secret"
    echo "API_KEY=$api_key"
    echo "ENCRYPTION_KEY=$encryption_key"
    echo "SESSION_SECRET=$session_secret"
    echo ""
    
    # Offer to update environment file
    if [[ -f "$ENV_FILE" ]]; then
        read -p "Update environment file with generated secrets? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            update_environment_variable "JWT_SECRET" "$jwt_secret"
            update_environment_variable "API_KEY" "$api_key"
            update_environment_variable "ENCRYPTION_KEY" "$encryption_key"
            update_environment_variable "SESSION_SECRET" "$session_secret"
            log_success "Environment file updated with generated secrets"
        fi
    fi
}

# Function to migrate environment to new format
migrate_environment() {
    log_info "Migrating environment to new format..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        return 1
    fi
    
    # Backup before migration
    local backup_file=$(backup_environment)
    log_info "Created backup before migration: $backup_file"
    
    # Migration rules
    local migrations=(
        "s/^SFMC_CLIENT_ID=/SFMC_CLIENT_ID=/"
        "s/^SFMC_CLIENT_SECRET=/SFMC_CLIENT_SECRET=/"
        "s/^SFMC_SUBDOMAIN=/SFMC_SUBDOMAIN=/"
        "s/^SFMC_ACCOUNT_ID=/SFMC_ACCOUNT_ID=/"
    )
    
    # Apply migrations
    for migration in "${migrations[@]}"; do
        sed -i.tmp "$migration" "$ENV_FILE"
    done
    
    # Remove temporary file
    rm -f "$ENV_FILE.tmp"
    
    log_success "Environment migration completed"
}

# Function to compare environment with template
compare_environment() {
    log_info "Comparing environment with template..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        return 1
    fi
    
    if [[ ! -f "$ENV_TEMPLATE" ]]; then
        log_error "Environment template not found: $ENV_TEMPLATE"
        return 1
    fi
    
    # Extract variable names from both files
    local env_vars=$(grep -E '^[A-Z_]+=.*' "$ENV_FILE" | cut -d= -f1 | sort)
    local template_vars=$(grep -E '^[A-Z_]+=.*' "$ENV_TEMPLATE" | cut -d= -f1 | sort)
    
    # Find missing variables
    local missing_in_env=$(comm -23 <(echo "$template_vars") <(echo "$env_vars"))
    local extra_in_env=$(comm -13 <(echo "$template_vars") <(echo "$env_vars"))
    
    echo ""
    echo "=== Environment Comparison ==="
    echo ""
    
    if [[ -n "$missing_in_env" ]]; then
        echo -e "${YELLOW}Variables in template but missing in environment:${NC}"
        echo "$missing_in_env" | sed 's/^/  - /'
        echo ""
    fi
    
    if [[ -n "$extra_in_env" ]]; then
        echo -e "${BLUE}Variables in environment but not in template:${NC}"
        echo "$extra_in_env" | sed 's/^/  - /'
        echo ""
    fi
    
    if [[ -z "$missing_in_env" && -z "$extra_in_env" ]]; then
        echo -e "${GREEN}Environment and template are in sync${NC}"
    fi
}

# Function to export environment
export_environment() {
    local format="${1:-env}"
    
    log_info "Exporting environment in $format format..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        return 1
    fi
    
    case "$format" in
        "json")
            echo "{"
            local first=true
            while IFS='=' read -r key value; do
                if [[ "$key" =~ ^[A-Z_]+$ ]]; then
                    if [[ "$first" == "true" ]]; then
                        first=false
                    else
                        echo ","
                    fi
                    echo -n "  \"$key\": \"$value\""
                fi
            done < "$ENV_FILE"
            echo ""
            echo "}"
            ;;
        
        "yaml")
            echo "environment:"
            while IFS='=' read -r key value; do
                if [[ "$key" =~ ^[A-Z_]+$ ]]; then
                    echo "  $key: \"$value\""
                fi
            done < "$ENV_FILE"
            ;;
        
        "docker")
            echo "# Docker environment file"
            grep -E '^[A-Z_]+=.*' "$ENV_FILE"
            ;;
        
        "env"|*)
            cat "$ENV_FILE"
            ;;
    esac
}

# Function to import environment from file
import_environment() {
    local import_file="$1"
    
    log_info "Importing environment from file: $import_file"
    
    if [[ ! -f "$import_file" ]]; then
        log_error "Import file not found: $import_file"
        return 1
    fi
    
    # Backup current environment
    if [[ -f "$ENV_FILE" ]]; then
        backup_environment > /dev/null
    fi
    
    # Detect file format and import
    if [[ "$import_file" == *.json ]]; then
        # Import from JSON
        log_info "Importing from JSON format..."
        
        if command -v jq &> /dev/null; then
            jq -r 'to_entries[] | "\(.key)=\(.value)"' "$import_file" > "$ENV_FILE"
        else
            log_error "jq is required to import JSON files"
            return 1
        fi
        
    elif [[ "$import_file" == *.yaml || "$import_file" == *.yml ]]; then
        # Import from YAML
        log_info "Importing from YAML format..."
        
        if command -v yq &> /dev/null; then
            yq eval '.environment | to_entries[] | "\(.key)=\(.value)"' "$import_file" > "$ENV_FILE"
        else
            log_error "yq is required to import YAML files"
            return 1
        fi
        
    else
        # Import as plain environment file
        log_info "Importing as environment file..."
        cp "$import_file" "$ENV_FILE"
    fi
    
    # Set proper permissions
    chmod 600 "$ENV_FILE"
    
    log_success "Environment imported successfully"
    
    # Validate imported environment
    validate_environment
}

# Function to show required variables
show_required_variables() {
    echo ""
    echo "=== Required Variables to Configure ==="
    echo ""
    echo "SFMC Integration:"
    echo "  - SFMC_CLIENT_ID: Your SFMC API Client ID"
    echo "  - SFMC_CLIENT_SECRET: Your SFMC API Client Secret"
    echo "  - SFMC_SUBDOMAIN: Your SFMC subdomain"
    echo "  - SFMC_ACCOUNT_ID: Your SFMC Account ID"
    echo "  - APP_EXTENSION_KEY: Your SFMC App Extension Key"
    echo ""
    echo "Security:"
    echo "  - JWT_SECRET: Strong random secret (min 32 characters)"
    echo ""
    echo "Optional but Recommended:"
    echo "  - SSL_ENABLED: Enable HTTPS (true/false)"
    echo "  - SSL_KEY_PATH: Path to SSL private key"
    echo "  - SSL_CERT_PATH: Path to SSL certificate"
    echo ""
}

# Main execution
main() {
    local command="${1:-}"
    
    case "$command" in
        "init")
            init_environment
            ;;
        "backup")
            backup_environment
            ;;
        "restore")
            local backup_file="${2:-}"
            restore_environment "$backup_file"
            ;;
        "validate")
            validate_environment
            ;;
        "update")
            local key="${2:-}"
            local value="${3:-}"
            if [[ -z "$key" || -z "$value" ]]; then
                log_error "Key and value are required for update"
                show_usage
                exit 1
            fi
            update_environment_variable "$key" "$value"
            ;;
        "generate-secrets")
            generate_secrets
            ;;
        "migrate")
            migrate_environment
            ;;
        "compare")
            compare_environment
            ;;
        "export")
            local format="${2:-env}"
            export_environment "$format"
            ;;
        "import")
            local import_file="${2:-}"
            if [[ -z "$import_file" ]]; then
                log_error "Import file is required"
                show_usage
                exit 1
            fi
            import_environment "$import_file"
            ;;
        "help"|"--help"|"-h"|"")
            show_usage
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"