#!/bin/bash

# SSL Certificate Setup Script for Send Time Optimization Activity
# This script helps set up SSL certificates for production deployment

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SSL_DIR="$PROJECT_DIR/ssl"
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

# Function to show usage
show_usage() {
    echo "SSL Certificate Setup for Send Time Optimization Activity"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  self-signed [domain]    Generate self-signed certificate for testing"
    echo "  letsencrypt [domain]    Set up Let's Encrypt certificate"
    echo "  import [key] [cert]     Import existing certificate files"
    echo "  renew                   Renew Let's Encrypt certificate"
    echo "  check                   Check current certificate status"
    echo "  remove                  Remove SSL configuration"
    echo ""
    echo "Examples:"
    echo "  $0 self-signed localhost"
    echo "  $0 letsencrypt example.com"
    echo "  $0 import /path/to/private.key /path/to/certificate.crt"
    echo "  $0 check"
    echo ""
}

# Function to create SSL directory
create_ssl_directory() {
    if [[ ! -d "$SSL_DIR" ]]; then
        mkdir -p "$SSL_DIR"
        chmod 700 "$SSL_DIR"
        log_success "Created SSL directory: $SSL_DIR"
    else
        log_info "SSL directory already exists: $SSL_DIR"
    fi
}

# Function to generate self-signed certificate
generate_self_signed() {
    local domain="${1:-localhost}"
    
    log_info "Generating self-signed certificate for domain: $domain"
    
    create_ssl_directory
    
    local key_file="$SSL_DIR/server.key"
    local cert_file="$SSL_DIR/server.crt"
    local config_file="$SSL_DIR/openssl.conf"
    
    # Create OpenSSL configuration
    cat > "$config_file" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=State
L=City
O=Organization
OU=IT Department
CN=$domain

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $domain
DNS.2 = localhost
DNS.3 = 127.0.0.1
IP.1 = 127.0.0.1
EOF
    
    # Generate private key
    log_info "Generating private key..."
    openssl genrsa -out "$key_file" 2048
    chmod 600 "$key_file"
    
    # Generate certificate
    log_info "Generating certificate..."
    openssl req -new -x509 -key "$key_file" -out "$cert_file" -days 365 -config "$config_file" -extensions v3_req
    chmod 644 "$cert_file"
    
    # Update environment file
    update_env_file "$key_file" "$cert_file"
    
    log_success "Self-signed certificate generated successfully"
    log_warning "Self-signed certificates should only be used for testing"
    
    # Display certificate information
    display_certificate_info "$cert_file"
    
    # Cleanup config file
    rm -f "$config_file"
}

# Function to set up Let's Encrypt certificate
setup_letsencrypt() {
    local domain="$1"
    
    log_info "Setting up Let's Encrypt certificate for domain: $domain"
    
    # Check if certbot is installed
    if ! command -v certbot &> /dev/null; then
        log_error "Certbot is not installed"
        log_info "Please install certbot first:"
        log_info "  Ubuntu/Debian: sudo apt install certbot"
        log_info "  CentOS/RHEL: sudo yum install certbot"
        log_info "  macOS: brew install certbot"
        return 1
    fi
    
    create_ssl_directory
    
    # Stop any running web server on port 80
    log_info "Checking for services on port 80..."
    local port_80_pid=$(lsof -ti:80 2>/dev/null || true)
    if [[ -n "$port_80_pid" ]]; then
        log_warning "Service running on port 80 (PID: $port_80_pid)"
        log_info "You may need to stop it temporarily for certificate generation"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return 1
        fi
    fi
    
    # Generate certificate using standalone mode
    log_info "Requesting Let's Encrypt certificate..."
    if sudo certbot certonly --standalone -d "$domain" --non-interactive --agree-tos --email "admin@$domain"; then
        local cert_path="/etc/letsencrypt/live/$domain"
        local key_file="$cert_path/privkey.pem"
        local cert_file="$cert_path/fullchain.pem"
        
        # Copy certificates to SSL directory
        sudo cp "$key_file" "$SSL_DIR/server.key"
        sudo cp "$cert_file" "$SSL_DIR/server.crt"
        
        # Set proper permissions
        sudo chown "$USER:$USER" "$SSL_DIR/server.key" "$SSL_DIR/server.crt"
        chmod 600 "$SSL_DIR/server.key"
        chmod 644 "$SSL_DIR/server.crt"
        
        # Update environment file
        update_env_file "$SSL_DIR/server.key" "$SSL_DIR/server.crt"
        
        # Set up auto-renewal
        setup_auto_renewal "$domain"
        
        log_success "Let's Encrypt certificate set up successfully"
        display_certificate_info "$SSL_DIR/server.crt"
        
    else
        log_error "Failed to obtain Let's Encrypt certificate"
        return 1
    fi
}

# Function to import existing certificate
import_certificate() {
    local key_file="$1"
    local cert_file="$2"
    local ca_file="${3:-}"
    
    log_info "Importing existing certificate files..."
    
    # Validate input files
    if [[ ! -f "$key_file" ]]; then
        log_error "Private key file not found: $key_file"
        return 1
    fi
    
    if [[ ! -f "$cert_file" ]]; then
        log_error "Certificate file not found: $cert_file"
        return 1
    fi
    
    # Validate key file
    if ! openssl rsa -in "$key_file" -check -noout > /dev/null 2>&1; then
        log_error "Invalid private key file: $key_file"
        return 1
    fi
    
    # Validate certificate file
    if ! openssl x509 -in "$cert_file" -noout -text > /dev/null 2>&1; then
        log_error "Invalid certificate file: $cert_file"
        return 1
    fi
    
    # Check if key and certificate match
    local key_hash=$(openssl rsa -in "$key_file" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 -hex | cut -d' ' -f2)
    local cert_hash=$(openssl x509 -in "$cert_file" -pubkey -noout -outform DER 2>/dev/null | openssl dgst -sha256 -hex | cut -d' ' -f2)
    
    if [[ "$key_hash" != "$cert_hash" ]]; then
        log_error "Private key and certificate do not match"
        return 1
    fi
    
    create_ssl_directory
    
    # Copy files to SSL directory
    cp "$key_file" "$SSL_DIR/server.key"
    cp "$cert_file" "$SSL_DIR/server.crt"
    
    if [[ -n "$ca_file" && -f "$ca_file" ]]; then
        cp "$ca_file" "$SSL_DIR/ca.crt"
        log_info "CA certificate imported"
    fi
    
    # Set proper permissions
    chmod 600 "$SSL_DIR/server.key"
    chmod 644 "$SSL_DIR/server.crt"
    if [[ -f "$SSL_DIR/ca.crt" ]]; then
        chmod 644 "$SSL_DIR/ca.crt"
    fi
    
    # Update environment file
    local ca_path=""
    if [[ -f "$SSL_DIR/ca.crt" ]]; then
        ca_path="$SSL_DIR/ca.crt"
    fi
    update_env_file "$SSL_DIR/server.key" "$SSL_DIR/server.crt" "$ca_path"
    
    log_success "Certificate imported successfully"
    display_certificate_info "$SSL_DIR/server.crt"
}

# Function to renew Let's Encrypt certificate
renew_certificate() {
    log_info "Renewing Let's Encrypt certificate..."
    
    if ! command -v certbot &> /dev/null; then
        log_error "Certbot is not installed"
        return 1
    fi
    
    # Renew certificate
    if sudo certbot renew --quiet; then
        log_success "Certificate renewed successfully"
        
        # Find the domain from existing certificate
        if [[ -f "$SSL_DIR/server.crt" ]]; then
            local domain=$(openssl x509 -in "$SSL_DIR/server.crt" -noout -subject | sed -n 's/.*CN=\([^,]*\).*/\1/p')
            
            if [[ -n "$domain" ]]; then
                local cert_path="/etc/letsencrypt/live/$domain"
                
                if [[ -d "$cert_path" ]]; then
                    # Copy renewed certificates
                    sudo cp "$cert_path/privkey.pem" "$SSL_DIR/server.key"
                    sudo cp "$cert_path/fullchain.pem" "$SSL_DIR/server.crt"
                    
                    # Set proper permissions
                    sudo chown "$USER:$USER" "$SSL_DIR/server.key" "$SSL_DIR/server.crt"
                    chmod 600 "$SSL_DIR/server.key"
                    chmod 644 "$SSL_DIR/server.crt"
                    
                    log_success "Certificate files updated"
                    display_certificate_info "$SSL_DIR/server.crt"
                    
                    # Restart application if running
                    if [[ -f "$SCRIPT_DIR/production-restart.sh" ]]; then
                        log_info "Restarting application to use new certificate..."
                        "$SCRIPT_DIR/production-restart.sh"
                    fi
                fi
            fi
        fi
    else
        log_error "Certificate renewal failed"
        return 1
    fi
}

# Function to check certificate status
check_certificate() {
    log_info "Checking SSL certificate status..."
    
    if [[ ! -f "$SSL_DIR/server.crt" ]]; then
        log_warning "No SSL certificate found"
        return 1
    fi
    
    local cert_file="$SSL_DIR/server.crt"
    local key_file="$SSL_DIR/server.key"
    
    # Check if certificate is valid
    if openssl x509 -in "$cert_file" -noout -text > /dev/null 2>&1; then
        log_success "Certificate file is valid"
        
        # Display certificate information
        display_certificate_info "$cert_file"
        
        # Check if private key exists and matches
        if [[ -f "$key_file" ]]; then
            if openssl rsa -in "$key_file" -check -noout > /dev/null 2>&1; then
                log_success "Private key file is valid"
                
                # Check if key and certificate match
                local key_hash=$(openssl rsa -in "$key_file" -pubout -outform DER 2>/dev/null | openssl dgst -sha256 -hex | cut -d' ' -f2)
                local cert_hash=$(openssl x509 -in "$cert_file" -pubkey -noout -outform DER 2>/dev/null | openssl dgst -sha256 -hex | cut -d' ' -f2)
                
                if [[ "$key_hash" == "$cert_hash" ]]; then
                    log_success "Private key and certificate match"
                else
                    log_error "Private key and certificate do not match"
                fi
            else
                log_error "Private key file is invalid"
            fi
        else
            log_warning "Private key file not found: $key_file"
        fi
        
        # Check environment configuration
        check_env_ssl_config
        
    else
        log_error "Certificate file is invalid"
        return 1
    fi
}

# Function to remove SSL configuration
remove_ssl() {
    log_info "Removing SSL configuration..."
    
    # Remove SSL files
    if [[ -d "$SSL_DIR" ]]; then
        rm -rf "$SSL_DIR"
        log_success "SSL directory removed: $SSL_DIR"
    fi
    
    # Update environment file to disable SSL
    if [[ -f "$ENV_FILE" ]]; then
        # Create backup
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        
        # Update SSL settings
        sed -i.tmp 's/^SSL_ENABLED=true/SSL_ENABLED=false/' "$ENV_FILE"
        sed -i.tmp 's/^PORT=443/PORT=3000/' "$ENV_FILE"
        
        # Comment out SSL paths
        sed -i.tmp 's/^SSL_KEY_PATH=/#SSL_KEY_PATH=/' "$ENV_FILE"
        sed -i.tmp 's/^SSL_CERT_PATH=/#SSL_CERT_PATH=/' "$ENV_FILE"
        sed -i.tmp 's/^SSL_CA_PATH=/#SSL_CA_PATH=/' "$ENV_FILE"
        
        # Remove temporary file
        rm -f "$ENV_FILE.tmp"
        
        log_success "Environment file updated to disable SSL"
    fi
    
    log_success "SSL configuration removed"
}

# Function to update environment file
update_env_file() {
    local key_file="$1"
    local cert_file="$2"
    local ca_file="${3:-}"
    
    log_info "Updating environment configuration..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_warning "Environment file not found, creating basic SSL configuration"
        cat > "$ENV_FILE" << EOF
# SSL Configuration
SSL_ENABLED=true
SSL_KEY_PATH=$key_file
SSL_CERT_PATH=$cert_file
PORT=443
EOF
    else
        # Create backup
        cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        
        # Update or add SSL configuration
        if grep -q "^SSL_ENABLED=" "$ENV_FILE"; then
            sed -i.tmp "s|^SSL_ENABLED=.*|SSL_ENABLED=true|" "$ENV_FILE"
        else
            echo "SSL_ENABLED=true" >> "$ENV_FILE"
        fi
        
        if grep -q "^SSL_KEY_PATH=" "$ENV_FILE"; then
            sed -i.tmp "s|^SSL_KEY_PATH=.*|SSL_KEY_PATH=$key_file|" "$ENV_FILE"
        else
            echo "SSL_KEY_PATH=$key_file" >> "$ENV_FILE"
        fi
        
        if grep -q "^SSL_CERT_PATH=" "$ENV_FILE"; then
            sed -i.tmp "s|^SSL_CERT_PATH=.*|SSL_CERT_PATH=$cert_file|" "$ENV_FILE"
        else
            echo "SSL_CERT_PATH=$cert_file" >> "$ENV_FILE"
        fi
        
        if [[ -n "$ca_file" ]]; then
            if grep -q "^SSL_CA_PATH=" "$ENV_FILE"; then
                sed -i.tmp "s|^SSL_CA_PATH=.*|SSL_CA_PATH=$ca_file|" "$ENV_FILE"
            else
                echo "SSL_CA_PATH=$ca_file" >> "$ENV_FILE"
            fi
        fi
        
        # Update port to 443 for HTTPS
        if grep -q "^PORT=" "$ENV_FILE"; then
            sed -i.tmp "s|^PORT=.*|PORT=443|" "$ENV_FILE"
        else
            echo "PORT=443" >> "$ENV_FILE"
        fi
        
        # Remove temporary file
        rm -f "$ENV_FILE.tmp"
    fi
    
    log_success "Environment file updated with SSL configuration"
}

# Function to display certificate information
display_certificate_info() {
    local cert_file="$1"
    
    echo ""
    echo "=== Certificate Information ==="
    
    # Subject
    local subject=$(openssl x509 -in "$cert_file" -noout -subject | sed 's/subject=//')
    echo "Subject: $subject"
    
    # Issuer
    local issuer=$(openssl x509 -in "$cert_file" -noout -issuer | sed 's/issuer=//')
    echo "Issuer: $issuer"
    
    # Validity dates
    local not_before=$(openssl x509 -in "$cert_file" -noout -startdate | cut -d= -f2)
    local not_after=$(openssl x509 -in "$cert_file" -noout -enddate | cut -d= -f2)
    echo "Valid from: $not_before"
    echo "Valid until: $not_after"
    
    # Days until expiration
    local end_epoch=$(date -d "$not_after" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$not_after" +%s 2>/dev/null || echo "0")
    local current_epoch=$(date +%s)
    local days_until_expiry=$(( (end_epoch - current_epoch) / 86400 ))
    
    if [[ $days_until_expiry -gt 0 ]]; then
        echo -e "Days until expiry: ${GREEN}$days_until_expiry${NC}"
    else
        echo -e "Days until expiry: ${RED}$days_until_expiry (EXPIRED)${NC}"
    fi
    
    # Subject Alternative Names
    local san=$(openssl x509 -in "$cert_file" -noout -text | grep -A1 "Subject Alternative Name" | tail -1 | sed 's/^[[:space:]]*//' || echo "None")
    echo "Subject Alternative Names: $san"
    
    # Key size
    local key_size=$(openssl x509 -in "$cert_file" -noout -text | grep "Public-Key:" | sed 's/.*(\([0-9]*\) bit).*/\1/' || echo "Unknown")
    echo "Key size: $key_size bits"
    
    # Signature algorithm
    local sig_alg=$(openssl x509 -in "$cert_file" -noout -text | grep "Signature Algorithm:" | head -1 | sed 's/.*Signature Algorithm: //' || echo "Unknown")
    echo "Signature algorithm: $sig_alg"
    
    echo ""
}

# Function to check environment SSL configuration
check_env_ssl_config() {
    log_info "Checking environment SSL configuration..."
    
    if [[ -f "$ENV_FILE" ]]; then
        set -a
        source "$ENV_FILE"
        set +a
        
        if [[ "${SSL_ENABLED:-false}" == "true" ]]; then
            log_success "SSL is enabled in environment"
            
            if [[ -n "${SSL_KEY_PATH:-}" && -f "${SSL_KEY_PATH}" ]]; then
                log_success "SSL key path is configured and file exists"
            else
                log_error "SSL key path is not configured or file missing"
            fi
            
            if [[ -n "${SSL_CERT_PATH:-}" && -f "${SSL_CERT_PATH}" ]]; then
                log_success "SSL certificate path is configured and file exists"
            else
                log_error "SSL certificate path is not configured or file missing"
            fi
            
            local port="${PORT:-3000}"
            if [[ "$port" == "443" ]]; then
                log_success "Port is configured for HTTPS: $port"
            else
                log_warning "Port is not standard HTTPS port: $port"
            fi
        else
            log_info "SSL is disabled in environment"
        fi
    else
        log_warning "Environment file not found: $ENV_FILE"
    fi
}

# Function to setup auto-renewal for Let's Encrypt
setup_auto_renewal() {
    local domain="$1"
    
    log_info "Setting up automatic certificate renewal..."
    
    # Create renewal script
    local renewal_script="/usr/local/bin/sto-cert-renewal.sh"
    
    sudo tee "$renewal_script" > /dev/null << EOF
#!/bin/bash
# Auto-renewal script for STO Activity SSL certificate

# Renew certificate
certbot renew --quiet

# Copy renewed certificate to application directory
if [[ -d "/etc/letsencrypt/live/$domain" ]]; then
    cp "/etc/letsencrypt/live/$domain/privkey.pem" "$SSL_DIR/server.key"
    cp "/etc/letsencrypt/live/$domain/fullchain.pem" "$SSL_DIR/server.crt"
    
    # Set proper permissions
    chown $USER:$USER "$SSL_DIR/server.key" "$SSL_DIR/server.crt"
    chmod 600 "$SSL_DIR/server.key"
    chmod 644 "$SSL_DIR/server.crt"
    
    # Restart application
    if [[ -f "$SCRIPT_DIR/production-restart.sh" ]]; then
        sudo -u $USER "$SCRIPT_DIR/production-restart.sh"
    fi
fi
EOF
    
    sudo chmod +x "$renewal_script"
    
    # Add cron job for auto-renewal (runs daily at 2 AM)
    local cron_job="0 2 * * * $renewal_script"
    
    # Check if cron job already exists
    if ! sudo crontab -l 2>/dev/null | grep -q "$renewal_script"; then
        (sudo crontab -l 2>/dev/null; echo "$cron_job") | sudo crontab -
        log_success "Auto-renewal cron job added"
    else
        log_info "Auto-renewal cron job already exists"
    fi
    
    log_success "Auto-renewal setup completed"
}

# Main execution
main() {
    local command="${1:-}"
    
    case "$command" in
        "self-signed")
            local domain="${2:-localhost}"
            generate_self_signed "$domain"
            ;;
        "letsencrypt")
            local domain="${2:-}"
            if [[ -z "$domain" ]]; then
                log_error "Domain is required for Let's Encrypt certificate"
                show_usage
                exit 1
            fi
            setup_letsencrypt "$domain"
            ;;
        "import")
            local key_file="${2:-}"
            local cert_file="${3:-}"
            local ca_file="${4:-}"
            
            if [[ -z "$key_file" || -z "$cert_file" ]]; then
                log_error "Key file and certificate file are required"
                show_usage
                exit 1
            fi
            import_certificate "$key_file" "$cert_file" "$ca_file"
            ;;
        "renew")
            renew_certificate
            ;;
        "check")
            check_certificate
            ;;
        "remove")
            remove_ssl
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