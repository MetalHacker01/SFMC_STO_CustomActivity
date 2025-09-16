/**
 * Timezone Validator Module
 * 
 * Provides validation and fallback mechanisms for timezone operations.
 * Handles edge cases and ensures robust timezone processing.
 */

const { TimezoneCalculator, SFMC_TIMEZONE } = require('./timezone-calculator');

/**
 * Validation result structure
 */
class ValidationResult {
    constructor(isValid, countryCode, message = '', fallbackUsed = false, fallbackValue = null) {
        this.isValid = isValid;
        this.countryCode = countryCode;
        this.message = message;
        this.fallbackUsed = fallbackUsed;
        this.fallbackValue = fallbackValue;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Timezone validation and fallback handler
 */
class TimezoneValidator {
    constructor(logger = console) {
        this.timezoneCalculator = new TimezoneCalculator();
        this.logger = logger;
        this.defaultCountryCode = 'US'; // Default fallback country
        this.validationStats = {
            totalValidations: 0,
            validCodes: 0,
            invalidCodes: 0,
            fallbacksUsed: 0,
            errors: 0
        };
    }

    /**
     * Validates a country code and provides fallback if needed
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code to validate
     * @param {Object} options - Validation options
     * @param {string} options.fallbackCountry - Custom fallback country code
     * @param {boolean} options.logIssues - Whether to log validation issues
     * @returns {ValidationResult} Validation result with fallback information
     */
    validateCountryCode(countryCode, options = {}) {
        const {
            fallbackCountry = this.defaultCountryCode,
            logIssues = true
        } = options;

        this.validationStats.totalValidations++;

        try {
            // Check if country code is provided
            if (!countryCode) {
                this.validationStats.invalidCodes++;
                this.validationStats.fallbacksUsed++;
                
                const message = 'Country code is null or undefined';
                if (logIssues) {
                    this.logger.warn(`Timezone validation: ${message}, using fallback: ${fallbackCountry}`);
                }
                
                return new ValidationResult(
                    false,
                    fallbackCountry,
                    message,
                    true,
                    fallbackCountry
                );
            }

            // Check if country code is a string
            if (typeof countryCode !== 'string') {
                this.validationStats.invalidCodes++;
                this.validationStats.fallbacksUsed++;
                
                const message = `Country code must be a string, received: ${typeof countryCode}`;
                if (logIssues) {
                    this.logger.warn(`Timezone validation: ${message}, using fallback: ${fallbackCountry}`);
                }
                
                return new ValidationResult(
                    false,
                    fallbackCountry,
                    message,
                    true,
                    fallbackCountry
                );
            }

            // Normalize country code
            const normalizedCode = countryCode.trim().toUpperCase();

            // Check if country code is empty after trimming
            if (normalizedCode.length === 0) {
                this.validationStats.invalidCodes++;
                this.validationStats.fallbacksUsed++;
                
                const message = 'Country code is empty after trimming';
                if (logIssues) {
                    this.logger.warn(`Timezone validation: ${message}, using fallback: ${fallbackCountry}`);
                }
                
                return new ValidationResult(
                    false,
                    fallbackCountry,
                    message,
                    true,
                    fallbackCountry
                );
            }

            // Check if country code has correct length (should be 2 characters)
            if (normalizedCode.length !== 2) {
                this.validationStats.invalidCodes++;
                this.validationStats.fallbacksUsed++;
                
                const message = `Country code must be 2 characters, received: ${normalizedCode} (${normalizedCode.length} chars)`;
                if (logIssues) {
                    this.logger.warn(`Timezone validation: ${message}, using fallback: ${fallbackCountry}`);
                }
                
                return new ValidationResult(
                    false,
                    fallbackCountry,
                    message,
                    true,
                    fallbackCountry
                );
            }

            // Check if country code contains only letters
            if (!/^[A-Z]{2}$/.test(normalizedCode)) {
                this.validationStats.invalidCodes++;
                this.validationStats.fallbacksUsed++;
                
                const message = `Country code must contain only letters, received: ${normalizedCode}`;
                if (logIssues) {
                    this.logger.warn(`Timezone validation: ${message}, using fallback: ${fallbackCountry}`);
                }
                
                return new ValidationResult(
                    false,
                    fallbackCountry,
                    message,
                    true,
                    fallbackCountry
                );
            }

            // Check if country code is supported
            if (!this.timezoneCalculator.isCountrySupported(normalizedCode)) {
                this.validationStats.invalidCodes++;
                this.validationStats.fallbacksUsed++;
                
                const message = `Country code ${normalizedCode} is not supported`;
                if (logIssues) {
                    this.logger.warn(`Timezone validation: ${message}, using fallback: ${fallbackCountry}`);
                    this.logger.info(`Supported countries: ${this.timezoneCalculator.getSupportedCountries().join(', ')}`);
                }
                
                return new ValidationResult(
                    false,
                    fallbackCountry,
                    message,
                    true,
                    fallbackCountry
                );
            }

            // Country code is valid
            this.validationStats.validCodes++;
            return new ValidationResult(
                true,
                normalizedCode,
                'Country code is valid'
            );

        } catch (error) {
            this.validationStats.errors++;
            this.validationStats.fallbacksUsed++;
            
            const message = `Error during country code validation: ${error.message}`;
            if (logIssues) {
                this.logger.error(`Timezone validation error: ${message}`, error);
            }
            
            return new ValidationResult(
                false,
                fallbackCountry,
                message,
                true,
                fallbackCountry
            );
        }
    }

    /**
     * Validates and gets timezone information with fallback
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Object} options - Validation options
     * @returns {Object} Timezone information with validation details
     */
    getValidatedTimezoneInfo(countryCode, options = {}) {
        const validation = this.validateCountryCode(countryCode, options);
        const effectiveCountryCode = validation.fallbackUsed ? validation.fallbackValue : validation.countryCode;
        
        try {
            const timezoneInfo = this.timezoneCalculator.getTimezoneInfo(effectiveCountryCode);
            const timezoneSummary = this.timezoneCalculator.getTimezoneSummary(effectiveCountryCode);
            
            return {
                validation,
                timezoneInfo,
                timezoneSummary,
                effectiveCountryCode
            };
        } catch (error) {
            this.logger.error(`Error getting timezone info for ${effectiveCountryCode}:`, error);
            
            // Ultimate fallback to SFMC timezone
            return {
                validation,
                timezoneInfo: {
                    countryName: 'Default (SFMC)',
                    primaryTimezone: 'America/Chicago',
                    utcOffset: SFMC_TIMEZONE.utcOffset,
                    businessTimezone: 'America/Chicago'
                },
                timezoneSummary: {
                    countryCode: effectiveCountryCode,
                    countryName: 'Default (SFMC)',
                    timezone: 'America/Chicago',
                    currentUtcOffset: SFMC_TIMEZONE.utcOffset,
                    formattedOffset: '-06:00',
                    offsetFromSFMC: 0,
                    sfmcOffset: SFMC_TIMEZONE.utcOffset,
                    isSupported: false,
                    date: new Date().toISOString()
                },
                effectiveCountryCode,
                ultimateFallback: true
            };
        }
    }

    /**
     * Validates a timezone string
     * @param {string} timezone - Timezone string to validate
     * @returns {boolean} True if timezone is valid
     */
    validateTimezone(timezone) {
        if (!timezone || typeof timezone !== 'string') {
            return false;
        }

        try {
            // Try to create a moment with the timezone
            const moment = require('moment-timezone');
            const testDate = new Date();
            
            // Check if timezone exists in moment-timezone data
            if (!moment.tz.zone(timezone)) {
                return false;
            }
            
            moment.tz(testDate, timezone);
            return true;
        } catch (error) {
            this.logger.warn(`Invalid timezone: ${timezone}`, error);
            return false;
        }
    }

    /**
     * Gets validation statistics
     * @returns {Object} Validation statistics
     */
    getValidationStats() {
        return {
            ...this.validationStats,
            successRate: this.validationStats.totalValidations > 0 
                ? (this.validationStats.validCodes / this.validationStats.totalValidations * 100).toFixed(2) + '%'
                : '0%',
            fallbackRate: this.validationStats.totalValidations > 0
                ? (this.validationStats.fallbacksUsed / this.validationStats.totalValidations * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Resets validation statistics
     */
    resetValidationStats() {
        this.validationStats = {
            totalValidations: 0,
            validCodes: 0,
            invalidCodes: 0,
            fallbacksUsed: 0,
            errors: 0
        };
    }

    /**
     * Sets the default fallback country code
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {boolean} True if successfully set
     */
    setDefaultFallbackCountry(countryCode) {
        const validation = this.validateCountryCode(countryCode, { logIssues: false });
        if (validation.isValid) {
            this.defaultCountryCode = validation.countryCode;
            this.logger.info(`Default fallback country set to: ${this.defaultCountryCode}`);
            return true;
        } else {
            this.logger.warn(`Cannot set invalid country code as default fallback: ${countryCode}`);
            return false;
        }
    }

    /**
     * Gets a list of common timezone mapping issues and their solutions
     * @returns {Array} Array of common issues and solutions
     */
    getCommonIssuesAndSolutions() {
        return [
            {
                issue: 'Country code is null or undefined',
                solution: 'Ensure the Geosegment field is populated in the data extension',
                fallback: 'Uses default country code (US)'
            },
            {
                issue: 'Country code is not 2 characters',
                solution: 'Use ISO 3166-1 alpha-2 format (e.g., "US", "GB", "BR")',
                fallback: 'Uses default country code'
            },
            {
                issue: 'Country code contains non-letter characters',
                solution: 'Remove numbers, spaces, and special characters from country code',
                fallback: 'Uses default country code'
            },
            {
                issue: 'Country code is not supported',
                solution: 'Add country to COUNTRY_TIMEZONE_MAP or use supported country',
                fallback: 'Uses default country code',
                supportedCountries: this.timezoneCalculator.getSupportedCountries()
            },
            {
                issue: 'Timezone calculation error',
                solution: 'Check system timezone data and moment-timezone library',
                fallback: 'Uses SFMC server timezone (CST)'
            }
        ];
    }

    /**
     * Logs timezone mapping issues for monitoring and debugging
     * @param {string} countryCode - Original country code that caused the issue
     * @param {ValidationResult} validation - Validation result
     * @param {Object} context - Additional context information
     */
    logTimezoneIssue(countryCode, validation, context = {}) {
        const logData = {
            timestamp: new Date().toISOString(),
            originalCountryCode: countryCode,
            validation,
            context,
            stats: this.getValidationStats()
        };

        if (validation.fallbackUsed) {
            this.logger.warn('Timezone mapping issue detected:', logData);
        } else {
            this.logger.debug('Timezone validation successful:', logData);
        }
    }
}

module.exports = {
    TimezoneValidator,
    ValidationResult
};