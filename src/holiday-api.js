/**
 * Holiday API Integration Module
 * Integrates with Nager.Date API for public holiday data
 * Includes error handling, timeouts, and fallback mechanisms
 */

const axios = require('axios');

class HolidayAPI {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://date.nager.at/api/v3';
        this.timeout = options.timeout || 5000; // 5 second timeout
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000; // 1 second initial delay
        
        // Create axios instance with default configuration
        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: this.timeout,
            headers: {
                'User-Agent': 'SFMC-STO-Activity/1.0.0',
                'Accept': 'application/json'
            }
        });
        
        // Add response interceptor for error handling
        this.client.interceptors.response.use(
            response => response,
            error => {
                // Transform error but don't throw here, let the calling method handle it
                return Promise.reject(this._transformError(error));
            }
        );
    }

    /**
     * Get public holidays for a specific country and year
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} year - Year to get holidays for
     * @returns {Promise<Array>} Array of holiday objects
     */
    async getHolidays(countryCode, year) {
        if (!countryCode || !year) {
            throw new Error('Country code and year are required');
        }

        // Validate country code format
        if (!/^[A-Z]{2}$/.test(countryCode)) {
            throw new Error('Invalid country code format. Expected 2-letter ISO code.');
        }

        // Validate year range
        const currentYear = new Date().getFullYear();
        if (year < currentYear - 1 || year > currentYear + 2) {
            throw new Error(`Year must be between ${currentYear - 1} and ${currentYear + 2}`);
        }

        const endpoint = `/PublicHolidays/${year}/${countryCode}`;
        
        try {
            const response = await this._makeRequestWithRetry(endpoint);
            return this._normalizeHolidayData(response.data, countryCode, year);
        } catch (error) {
            console.error(`Failed to fetch holidays for ${countryCode} ${year}:`, error.message);
            throw error;
        }
    }

    /**
     * Get available countries supported by the API
     * @returns {Promise<Array>} Array of supported country objects
     */
    async getSupportedCountries() {
        const endpoint = '/AvailableCountries';
        
        try {
            const response = await this._makeRequestWithRetry(endpoint);
            return response.data.map(country => ({
                countryCode: country.countryCode,
                name: country.name
            }));
        } catch (error) {
            console.error('Failed to fetch supported countries:', error.message);
            // Return fallback list of commonly supported countries
            return this._getFallbackCountries();
        }
    }

    /**
     * Check if the API is available and responsive
     * @returns {Promise<boolean>} True if API is available
     */
    async isAPIAvailable() {
        try {
            const response = await this.client.get('/AvailableCountries', {
                timeout: 3000 // Shorter timeout for health check
            });
            return response.status === 200;
        } catch (error) {
            console.warn('Holiday API is not available:', error.message);
            return false;
        }
    }

    /**
     * Make HTTP request with retry logic
     * @private
     */
    async _makeRequestWithRetry(endpoint, attempt = 1) {
        try {
            return await this.client.get(endpoint);
        } catch (error) {
            if (attempt < this.retryAttempts && this._isRetryableError(error)) {
                const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                console.warn(`API request failed (attempt ${attempt}/${this.retryAttempts}), retrying in ${delay}ms...`);
                
                await this._sleep(delay);
                return this._makeRequestWithRetry(endpoint, attempt + 1);
            }
            // Transform error before throwing
            throw this._transformError(error);
        }
    }

    /**
     * Transform API errors to provide meaningful error messages
     * @private
     */
    _transformError(error) {
        if (error.response) {
            // Server responded with error status
            const status = error.response.status;
            const message = error.response.data?.message || error.response.statusText;
            
            switch (status) {
                case 404:
                    return new Error(`Country not supported or data not available: ${message}`);
                case 429:
                    return new Error('API rate limit exceeded. Please try again later.');
                case 500:
                case 502:
                case 503:
                case 504:
                    return new Error(`Holiday API server error (${status}). Please try again later.`);
                default:
                    return new Error(`Holiday API error (${status}): ${message}`);
            }
        } else if (error.request) {
            // Network error
            return new Error('Unable to connect to holiday API. Please check your internet connection.');
        } else {
            // Other error
            return new Error(`Holiday API request failed: ${error.message}`);
        }
    }

    /**
     * Check if error is retryable
     * @private
     */
    _isRetryableError(error) {
        if (!error.response) {
            return true; // Network errors are retryable
        }
        
        const status = error.response.status;
        return status >= 500 || status === 429; // Server errors and rate limits are retryable
    }

    /**
     * Normalize holiday data from API response
     * @private
     */
    _normalizeHolidayData(holidays, countryCode, year) {
        if (!Array.isArray(holidays)) {
            return [];
        }

        return holidays
            .filter(holiday => holiday !== null && holiday !== undefined)
            .map(holiday => ({
                date: holiday?.date || null,
                name: holiday?.name || holiday?.localName || null,
                countryCode: countryCode,
                year: year,
                type: holiday?.types?.includes('Public') ? 'public' : 'observance',
                global: holiday?.global || false,
                launchYear: holiday?.launchYear || null
            }));
    }

    /**
     * Get fallback list of supported countries when API is unavailable
     * @private
     */
    _getFallbackCountries() {
        return [
            { countryCode: 'US', name: 'United States' },
            { countryCode: 'CA', name: 'Canada' },
            { countryCode: 'GB', name: 'United Kingdom' },
            { countryCode: 'AU', name: 'Australia' },
            { countryCode: 'DE', name: 'Germany' },
            { countryCode: 'FR', name: 'France' },
            { countryCode: 'IT', name: 'Italy' },
            { countryCode: 'ES', name: 'Spain' },
            { countryCode: 'BR', name: 'Brazil' },
            { countryCode: 'IN', name: 'India' },
            { countryCode: 'JP', name: 'Japan' },
            { countryCode: 'CN', name: 'China' },
            { countryCode: 'RU', name: 'Russia' },
            { countryCode: 'ZA', name: 'South Africa' }
        ];
    }

    /**
     * Sleep utility for retry delays
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HolidayAPI;