/**
 * Timezone Engine - Main Integration Module
 * 
 * Combines TimezoneCalculator and TimezoneValidator to provide a unified
 * interface for timezone operations in the Send Time Optimization activity.
 */

const { TimezoneCalculator } = require('./timezone-calculator');
const { TimezoneValidator } = require('./timezone-validator');

/**
 * Main timezone engine that provides all timezone-related functionality
 * with built-in validation and fallback mechanisms
 */
class TimezoneEngine {
    constructor(logger = console, options = {}) {
        this.logger = logger;
        this.calculator = new TimezoneCalculator();
        this.validator = new TimezoneValidator(logger);
        
        // Configuration options
        this.options = {
            defaultFallbackCountry: options.defaultFallbackCountry || 'US',
            logValidationIssues: options.logValidationIssues !== false, // Default to true
            enableDetailedLogging: options.enableDetailedLogging || false,
            ...options
        };

        // Set default fallback country if provided
        if (this.options.defaultFallbackCountry !== 'US') {
            this.validator.setDefaultFallbackCountry(this.options.defaultFallbackCountry);
        }
    }

    /**
     * Main method to get timezone information with validation and fallback
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Object} context - Additional context for logging
     * @returns {Object} Complete timezone information with validation details
     */
    getTimezoneInfo(countryCode, context = {}) {
        try {
            const result = this.validator.getValidatedTimezoneInfo(countryCode, {
                logIssues: this.options.logValidationIssues
            });

            // Log validation issues if enabled
            if (this.options.enableDetailedLogging || result.validation.fallbackUsed) {
                this.validator.logTimezoneIssue(countryCode, result.validation, context);
            }

            return {
                success: true,
                countryCode: result.effectiveCountryCode,
                validation: result.validation,
                timezone: result.timezoneInfo,
                summary: result.timezoneSummary,
                ultimateFallback: result.ultimateFallback || false
            };
        } catch (error) {
            this.logger.error('Error in timezone engine:', error);
            
            // Return ultimate fallback
            return {
                success: false,
                error: error.message,
                countryCode: this.options.defaultFallbackCountry,
                validation: {
                    isValid: false,
                    fallbackUsed: true,
                    message: `Engine error: ${error.message}`
                },
                timezone: {
                    countryName: 'Default (SFMC)',
                    primaryTimezone: 'America/Chicago',
                    utcOffset: -6,
                    businessTimezone: 'America/Chicago'
                },
                ultimateFallback: true
            };
        }
    }

    /**
     * Converts local time to SFMC server time with validation
     * @param {Date} localTime - Local time to convert
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Object} context - Additional context for logging
     * @returns {Object} Conversion result with SFMC time
     */
    convertToSFMCTime(localTime, countryCode, context = {}) {
        if (!localTime || !(localTime instanceof Date)) {
            return {
                success: false,
                error: 'Invalid local time provided',
                originalTime: localTime,
                sfmcTime: null
            };
        }

        try {
            // Get validated timezone info
            const timezoneInfo = this.getTimezoneInfo(countryCode, context);
            const effectiveCountryCode = timezoneInfo.countryCode;

            // Perform conversion
            const sfmcTime = this.calculator.convertToSFMCTime(localTime, effectiveCountryCode);

            return {
                success: true,
                originalTime: localTime,
                sfmcTime: sfmcTime,
                countryCode: effectiveCountryCode,
                timezone: timezoneInfo.timezone,
                validation: timezoneInfo.validation,
                offsetFromSFMC: this.calculator.getOffsetFromSFMC(effectiveCountryCode, localTime)
            };
        } catch (error) {
            this.logger.error(`Error converting time to SFMC for country ${countryCode}:`, error);
            
            return {
                success: false,
                error: error.message,
                originalTime: localTime,
                sfmcTime: new Date(localTime), // Fallback: assume already in SFMC time
                countryCode: countryCode
            };
        }
    }

    /**
     * Converts SFMC server time to local time with validation
     * @param {Date} sfmcTime - SFMC server time
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Object} context - Additional context for logging
     * @returns {Object} Conversion result with local time
     */
    convertFromSFMCTime(sfmcTime, countryCode, context = {}) {
        if (!sfmcTime || !(sfmcTime instanceof Date)) {
            return {
                success: false,
                error: 'Invalid SFMC time provided',
                sfmcTime: sfmcTime,
                localTime: null
            };
        }

        try {
            // Get validated timezone info
            const timezoneInfo = this.getTimezoneInfo(countryCode, context);
            const effectiveCountryCode = timezoneInfo.countryCode;

            // Perform conversion
            const localTime = this.calculator.convertFromSFMCTime(sfmcTime, effectiveCountryCode);

            return {
                success: true,
                sfmcTime: sfmcTime,
                localTime: localTime,
                countryCode: effectiveCountryCode,
                timezone: timezoneInfo.timezone,
                validation: timezoneInfo.validation,
                offsetFromSFMC: this.calculator.getOffsetFromSFMC(effectiveCountryCode, sfmcTime)
            };
        } catch (error) {
            this.logger.error(`Error converting SFMC time to local for country ${countryCode}:`, error);
            
            return {
                success: false,
                error: error.message,
                sfmcTime: sfmcTime,
                localTime: new Date(sfmcTime), // Fallback: assume already in local time
                countryCode: countryCode
            };
        }
    }

    /**
     * Gets comprehensive timezone summary for a country
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Date} date - Date to get summary for (defaults to current date)
     * @param {Object} context - Additional context for logging
     * @returns {Object} Complete timezone summary
     */
    getTimezoneSummary(countryCode, date = new Date(), context = {}) {
        try {
            const timezoneInfo = this.getTimezoneInfo(countryCode, context);
            const summary = this.calculator.getTimezoneSummary(timezoneInfo.countryCode, date);

            return {
                success: true,
                ...summary,
                validation: timezoneInfo.validation,
                fallbackUsed: timezoneInfo.validation.fallbackUsed,
                ultimateFallback: timezoneInfo.ultimateFallback
            };
        } catch (error) {
            this.logger.error(`Error getting timezone summary for ${countryCode}:`, error);
            
            return {
                success: false,
                error: error.message,
                countryCode: countryCode,
                date: date.toISOString()
            };
        }
    }

    /**
     * Validates multiple country codes at once
     * @param {Array<string>} countryCodes - Array of country codes to validate
     * @returns {Object} Validation results for all countries
     */
    validateMultipleCountries(countryCodes) {
        if (!Array.isArray(countryCodes)) {
            return {
                success: false,
                error: 'Country codes must be provided as an array'
            };
        }

        const results = {
            success: true,
            total: countryCodes.length,
            valid: 0,
            invalid: 0,
            results: []
        };

        countryCodes.forEach(code => {
            const validation = this.validator.validateCountryCode(code, {
                logIssues: this.options.logValidationIssues
            });
            
            results.results.push({
                originalCode: code,
                validation: validation
            });

            if (validation.isValid) {
                results.valid++;
            } else {
                results.invalid++;
            }
        });

        return results;
    }

    /**
     * Gets engine statistics and health information
     * @returns {Object} Engine statistics
     */
    getEngineStats() {
        return {
            validationStats: this.validator.getValidationStats(),
            supportedCountries: this.calculator.getSupportedCountries(),
            supportedCountriesCount: this.calculator.getSupportedCountries().length,
            configuration: {
                defaultFallbackCountry: this.options.defaultFallbackCountry,
                logValidationIssues: this.options.logValidationIssues,
                enableDetailedLogging: this.options.enableDetailedLogging
            },
            sfmcTimezone: this.calculator.sfmcTimezone
        };
    }

    /**
     * Resets all statistics and caches
     */
    reset() {
        this.validator.resetValidationStats();
        this.logger.info('Timezone engine reset completed');
    }

    /**
     * Updates engine configuration
     * @param {Object} newOptions - New configuration options
     */
    updateConfiguration(newOptions) {
        this.options = { ...this.options, ...newOptions };
        
        if (newOptions.defaultFallbackCountry) {
            this.validator.setDefaultFallbackCountry(newOptions.defaultFallbackCountry);
        }
        
        this.logger.info('Timezone engine configuration updated', this.options);
    }

    /**
     * Gets troubleshooting information for common issues
     * @returns {Object} Troubleshooting guide
     */
    getTroubleshootingInfo() {
        return {
            commonIssues: this.validator.getCommonIssuesAndSolutions(),
            supportedCountries: this.calculator.getSupportedCountriesDetailed(),
            validationStats: this.validator.getValidationStats(),
            engineConfiguration: this.options,
            testInstructions: {
                validateCountry: 'Use getTimezoneInfo(countryCode) to test country validation',
                convertTime: 'Use convertToSFMCTime(date, countryCode) to test time conversion',
                checkStats: 'Use getEngineStats() to view current statistics'
            }
        };
    }
}

module.exports = {
    TimezoneEngine
};