/**
 * SFMC API Authentication Service
 * Handles OAuth 2.0 authentication, token management, and refresh logic
 */

const axios = require('axios');

class SFMCAuthService {
    constructor(config, logger = console) {
        this.config = {
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            subdomain: config.subdomain,
            accountId: config.accountId,
            authUrl: config.authUrl || `https://${config.subdomain}.auth.marketingcloudapis.com/v2/token`,
            restBaseUrl: config.restBaseUrl || `https://${config.subdomain}.rest.marketingcloudapis.com`,
            scope: config.scope || 'data_extensions_read data_extensions_write'
        };
        
        this.logger = logger;
        this.tokenData = null;
        this.tokenExpiryTime = null;
        this.refreshPromise = null;
        
        // Validate required configuration
        this.validateConfig();
    }

    /**
     * Validates required configuration parameters
     */
    validateConfig() {
        const required = ['clientId', 'clientSecret', 'subdomain'];
        const missing = required.filter(key => !this.config[key]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required SFMC configuration: ${missing.join(', ')}`);
        }
    }

    /**
     * Authenticates with SFMC and retrieves access token
     * @returns {Promise<string>} Access token
     */
    async authenticate() {
        try {
            this.logger.info('Authenticating with SFMC API...');
            
            const authPayload = {
                grant_type: 'client_credentials',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                scope: this.config.scope
            };

            // Add account_id if provided (for multi-tenant scenarios)
            if (this.config.accountId) {
                authPayload.account_id = this.config.accountId;
            }

            const response = await axios.post(this.config.authUrl, authPayload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            });

            if (response.data && response.data.access_token) {
                this.tokenData = response.data;
                
                // Calculate expiry time (subtract 60 seconds for buffer)
                const expiresIn = response.data.expires_in || 3600;
                this.tokenExpiryTime = Date.now() + ((expiresIn - 60) * 1000);
                
                this.logger.info('SFMC authentication successful', {
                    expiresIn: expiresIn,
                    tokenType: response.data.token_type,
                    scope: response.data.scope
                });
                
                return response.data.access_token;
            } else {
                throw new Error('Invalid authentication response from SFMC');
            }
        } catch (error) {
            this.logger.error('SFMC authentication failed:', {
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });
            
            // Clear any existing token data on failure
            this.tokenData = null;
            this.tokenExpiryTime = null;
            
            throw new Error(`SFMC authentication failed: ${error.message}`);
        }
    }

    /**
     * Gets a valid access token, refreshing if necessary
     * @returns {Promise<string>} Valid access token
     */
    async getValidToken() {
        // If we have a refresh in progress, wait for it
        if (this.refreshPromise) {
            return await this.refreshPromise;
        }

        // Check if we need to authenticate or refresh
        if (!this.tokenData || this.isTokenExpired()) {
            this.refreshPromise = this.authenticate();
            
            try {
                const token = await this.refreshPromise;
                this.refreshPromise = null;
                return token;
            } catch (error) {
                this.refreshPromise = null;
                throw error;
            }
        }

        return this.tokenData.access_token;
    }

    /**
     * Checks if the current token is expired or about to expire
     * @returns {boolean} True if token is expired or about to expire
     */
    isTokenExpired() {
        if (!this.tokenExpiryTime) {
            return true;
        }
        
        // Consider token expired if it expires within the next 60 seconds
        return Date.now() >= this.tokenExpiryTime;
    }

    /**
     * Gets authentication headers for API requests
     * @returns {Promise<Object>} Headers object with authorization
     */
    async getAuthHeaders() {
        const token = await this.getValidToken();
        
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Makes an authenticated request to SFMC API
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint (relative to rest base URL)
     * @param {Object} data - Request data
     * @param {Object} options - Additional axios options
     * @returns {Promise<Object>} API response
     */
    async makeAuthenticatedRequest(method, endpoint, data = null, options = {}) {
        const headers = await this.getAuthHeaders();
        const url = `${this.config.restBaseUrl}${endpoint}`;
        
        const requestConfig = {
            method,
            url,
            headers: { ...headers, ...options.headers },
            timeout: options.timeout || 30000,
            ...options
        };

        if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
            requestConfig.data = data;
        }

        try {
            this.logger.debug('Making authenticated SFMC API request:', {
                method,
                endpoint,
                hasData: !!data
            });

            const response = await axios(requestConfig);
            
            this.logger.debug('SFMC API request successful:', {
                method,
                endpoint,
                status: response.status
            });

            return response.data;
        } catch (error) {
            this.logger.error('SFMC API request failed:', {
                method,
                endpoint,
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data
            });

            // If we get a 401, the token might be invalid - clear it
            if (error.response?.status === 401) {
                this.logger.warn('Received 401 response, clearing token data');
                this.tokenData = null;
                this.tokenExpiryTime = null;
            }

            throw error;
        }
    }

    /**
     * Gets current token information for debugging
     * @returns {Object} Token status information
     */
    getTokenStatus() {
        return {
            hasToken: !!this.tokenData,
            isExpired: this.isTokenExpired(),
            expiryTime: this.tokenExpiryTime ? new Date(this.tokenExpiryTime).toISOString() : null,
            timeUntilExpiry: this.tokenExpiryTime ? Math.max(0, this.tokenExpiryTime - Date.now()) : null
        };
    }

    /**
     * Clears stored token data (useful for testing or forced re-authentication)
     */
    clearToken() {
        this.logger.info('Clearing stored SFMC token data');
        this.tokenData = null;
        this.tokenExpiryTime = null;
        this.refreshPromise = null;
    }
}

module.exports = SFMCAuthService;