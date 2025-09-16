/**
 * Holiday Validation Logic
 * Combines holiday API and caching to provide holiday checking functionality
 * Includes logic to find next non-holiday business day and handle unavailable data
 */

const HolidayAPI = require('./holiday-api');
const HolidayCache = require('./holiday-cache');

class HolidayChecker {
    constructor(options = {}) {
        this.holidayAPI = new HolidayAPI(options.api || {});
        this.holidayCache = new HolidayCache(options.cache || {});
        
        // Configuration
        this.enabled = options.enabled !== false; // Default to enabled
        this.fallbackBehavior = options.fallbackBehavior || 'ignore'; // 'ignore' or 'assume_holiday'
        this.maxLookAheadDays = options.maxLookAheadDays || 30; // Maximum days to look ahead for next business day
        
        // Weekend configuration (0 = Sunday, 6 = Saturday)
        this.weekendDays = options.weekendDays || [0, 6]; // Sunday and Saturday by default
        
        // Statistics
        this.stats = {
            apiCalls: 0,
            cacheHits: 0,
            cacheMisses: 0,
            holidaysFound: 0,
            businessDaysFound: 0,
            errors: 0
        };
    }

    /**
     * Check if a specific date is a public holiday for a country
     * @param {Date} date - Date to check
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {Promise<boolean>} True if the date is a public holiday
     */
    async isPublicHoliday(date, countryCode) {
        if (!this.enabled) {
            return false;
        }

        // Validate inputs (outside try-catch to ensure they throw)
        if (!date || !countryCode) {
            throw new Error('Date and country code are required');
        }

        if (!(date instanceof Date) || isNaN(date.getTime())) {
            throw new Error('Invalid date provided');
        }

        try {

            const year = date.getFullYear();
            const dateString = this._formatDate(date);

            // Get holiday data for the year
            const holidays = await this._getHolidayData(countryCode, year);

            if (!holidays || !Array.isArray(holidays)) {
                console.warn(`No holiday data available for ${countryCode} ${year}`);
                return this._handleMissingData(countryCode, year);
            }

            // Check if the date matches any holiday
            const isHoliday = holidays.some(holiday => holiday.date === dateString);

            if (isHoliday) {
                this.stats.holidaysFound++;
                console.debug(`Holiday found: ${dateString} in ${countryCode}`);
            }

            return isHoliday;

        } catch (error) {
            this.stats.errors++;
            console.error(`Error checking holiday for ${countryCode}:`, error.message);
            return this._handleError(error, countryCode);
        }
    }

    /**
     * Check if a date is a weekend day
     * @param {Date} date - Date to check
     * @returns {boolean} True if the date is a weekend
     */
    isWeekend(date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return false;
        }

        const dayOfWeek = date.getDay();
        return this.weekendDays.includes(dayOfWeek);
    }

    /**
     * Check if a date is a business day (not weekend and not holiday)
     * @param {Date} date - Date to check
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {boolean} skipWeekends - Whether to consider weekends as non-business days
     * @param {boolean} skipHolidays - Whether to consider holidays as non-business days
     * @returns {Promise<boolean>} True if the date is a business day
     */
    async isBusinessDay(date, countryCode, skipWeekends = true, skipHolidays = true) {
        try {
            // Check weekend
            if (skipWeekends && this.isWeekend(date)) {
                return false;
            }

            // Check holiday
            if (skipHolidays && await this.isPublicHoliday(date, countryCode)) {
                return false;
            }

            return true;

        } catch (error) {
            console.error(`Error checking business day for ${countryCode}:`, error.message);
            // Default to treating as business day on error
            return !skipWeekends || !this.isWeekend(date);
        }
    }

    /**
     * Find the next business day from a given date
     * @param {Date} startDate - Starting date
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {boolean} skipWeekends - Whether to skip weekends
     * @param {boolean} skipHolidays - Whether to skip holidays
     * @returns {Promise<Date>} Next business day
     */
    async getNextBusinessDay(startDate, countryCode, skipWeekends = true, skipHolidays = true) {
        // Validate inputs (outside try-catch to ensure they throw)
        if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
            throw new Error('Invalid start date provided');
        }

        try {

            let currentDate = new Date(startDate);
            let daysChecked = 0;

            while (daysChecked < this.maxLookAheadDays) {
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
                daysChecked++;

                // Check if this is a business day
                const isBusinessDay = await this.isBusinessDay(currentDate, countryCode, skipWeekends, skipHolidays);

                if (isBusinessDay) {
                    this.stats.businessDaysFound++;
                    console.debug(`Next business day found: ${this._formatDate(currentDate)} (${daysChecked} days ahead)`);
                    return new Date(currentDate);
                }
            }

            // If we couldn't find a business day within the limit, return the date after the limit
            console.warn(`Could not find business day within ${this.maxLookAheadDays} days, returning fallback date`);
            const fallbackDate = new Date(startDate);
            fallbackDate.setDate(fallbackDate.getDate() + this.maxLookAheadDays);
            return fallbackDate;

        } catch (error) {
            this.stats.errors++;
            console.error(`Error finding next business day for ${countryCode}:`, error.message);
            
            // Fallback: return next day
            const fallbackDate = new Date(startDate);
            fallbackDate.setDate(fallbackDate.getDate() + 1);
            return fallbackDate;
        }
    }

    /**
     * Get holidays for a specific country and year range
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {number} startYear - Starting year
     * @param {number} endYear - Ending year (optional, defaults to startYear)
     * @returns {Promise<Array>} Array of holidays
     */
    async getHolidays(countryCode, startYear, endYear = null) {
        const years = endYear ? this._getYearRange(startYear, endYear) : [startYear];
        const allHolidays = [];

        for (const year of years) {
            try {
                const holidays = await this._getHolidayData(countryCode, year);
                if (holidays && Array.isArray(holidays)) {
                    allHolidays.push(...holidays);
                }
            } catch (error) {
                console.warn(`Failed to get holidays for ${countryCode} ${year}:`, error.message);
            }
        }

        return allHolidays.sort((a, b) => a.date.localeCompare(b.date));
    }

    /**
     * Warm up the cache with holiday data for commonly used countries
     * @param {Array} countries - Countries to warm up (optional)
     * @param {Array} years - Years to warm up (optional)
     * @returns {Promise<Object>} Warmup results
     */
    async warmupCache(countries = null, years = null) {
        if (!this.enabled) {
            return { success: 0, failed: 0, skipped: 0, errors: ['Holiday checking is disabled'] };
        }

        const holidayFetcher = async (countryCode, year) => {
            try {
                this.stats.apiCalls++;
                return await this.holidayAPI.getHolidays(countryCode, year);
            } catch (error) {
                console.warn(`Failed to fetch holidays for warmup: ${countryCode} ${year}`, error.message);
                return null;
            }
        };

        return await this.holidayCache.warmup(holidayFetcher, countries, years);
    }

    /**
     * Check if the holiday API is available
     * @returns {Promise<boolean>} True if API is available
     */
    async isAPIAvailable() {
        if (!this.enabled) {
            return false;
        }

        return await this.holidayAPI.isAPIAvailable();
    }

    /**
     * Get supported countries from the API
     * @returns {Promise<Array>} Array of supported countries
     */
    async getSupportedCountries() {
        if (!this.enabled) {
            return [];
        }

        try {
            return await this.holidayAPI.getSupportedCountries();
        } catch (error) {
            console.error('Failed to get supported countries:', error.message);
            return [];
        }
    }

    /**
     * Get statistics about holiday checking operations
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            cache: this.holidayCache.getStats(),
            enabled: this.enabled,
            fallbackBehavior: this.fallbackBehavior
        };
    }

    /**
     * Clear all cached holiday data
     * @returns {boolean} True if successfully cleared
     */
    clearCache() {
        return this.holidayCache.clear();
    }

    /**
     * Get holiday data for a country and year (with caching)
     * @private
     */
    async _getHolidayData(countryCode, year) {
        // Try cache first
        const cached = this.holidayCache.get(countryCode, year);
        
        if (cached) {
            this.stats.cacheHits++;
            console.debug(`Cache hit for ${countryCode} ${year}`);
            return cached.data;
        }

        // Cache miss - fetch from API
        this.stats.cacheMisses++;
        this.stats.apiCalls++;
        console.debug(`Cache miss for ${countryCode} ${year}, fetching from API`);

        try {
            const holidays = await this.holidayAPI.getHolidays(countryCode, year);
            
            // Cache the result
            if (holidays && Array.isArray(holidays)) {
                this.holidayCache.set(countryCode, year, holidays);
            }
            
            return holidays;

        } catch (error) {
            console.warn(`Failed to fetch holidays from API for ${countryCode} ${year}:`, error.message);
            throw error;
        }
    }

    /**
     * Handle missing holiday data based on fallback behavior
     * @private
     */
    _handleMissingData(countryCode, year) {
        switch (this.fallbackBehavior) {
            case 'assume_holiday':
                console.warn(`Assuming holiday due to missing data for ${countryCode} ${year}`);
                return true;
            case 'ignore':
            default:
                console.debug(`Ignoring missing holiday data for ${countryCode} ${year}`);
                return false;
        }
    }

    /**
     * Handle errors based on fallback behavior
     * @private
     */
    _handleError(error, countryCode) {
        switch (this.fallbackBehavior) {
            case 'assume_holiday':
                console.warn(`Assuming holiday due to error for ${countryCode}:`, error.message);
                return true;
            case 'ignore':
            default:
                console.debug(`Ignoring error for ${countryCode}:`, error.message);
                return false;
        }
    }

    /**
     * Format date as YYYY-MM-DD string
     * @private
     */
    _formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    /**
     * Generate array of years between start and end (inclusive)
     * @private
     */
    _getYearRange(startYear, endYear) {
        const years = [];
        for (let year = startYear; year <= endYear; year++) {
            years.push(year);
        }
        return years;
    }
}

module.exports = HolidayChecker;