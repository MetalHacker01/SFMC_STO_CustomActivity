/**
 * Timezone Calculator Module
 * 
 * Handles timezone calculations for the Send Time Optimization activity.
 * Provides country code to timezone mapping and conversion utilities.
 */

const moment = require('moment-timezone');

/**
 * Comprehensive mapping of ISO 3166-1 alpha-2 country codes to timezone information
 * For countries with multiple timezones, uses the primary business timezone
 */
const COUNTRY_TIMEZONE_MAP = {
    // Americas
    'US': {
        countryName: 'United States',
        primaryTimezone: 'America/New_York', // Eastern Time (business standard)
        utcOffset: -5, // EST offset (will be adjusted for DST)
        businessTimezone: 'America/New_York'
    },
    'CA': {
        countryName: 'Canada',
        primaryTimezone: 'America/Toronto', // Eastern Time (most populous)
        utcOffset: -5,
        businessTimezone: 'America/Toronto'
    },
    'BR': {
        countryName: 'Brazil',
        primaryTimezone: 'America/Sao_Paulo', // Brasília Time (business center)
        utcOffset: -3,
        businessTimezone: 'America/Sao_Paulo'
    },

    // Europe
    'GB': {
        countryName: 'United Kingdom',
        primaryTimezone: 'Europe/London',
        utcOffset: 0, // GMT
        businessTimezone: 'Europe/London'
    },
    'RU': {
        countryName: 'Russia',
        primaryTimezone: 'Europe/Moscow', // Moscow Time (business center)
        utcOffset: 3,
        businessTimezone: 'Europe/Moscow'
    },

    // Asia-Pacific
    'CN': {
        countryName: 'China',
        primaryTimezone: 'Asia/Shanghai', // China Standard Time
        utcOffset: 8,
        businessTimezone: 'Asia/Shanghai'
    },
    'JP': {
        countryName: 'Japan',
        primaryTimezone: 'Asia/Tokyo',
        utcOffset: 9,
        businessTimezone: 'Asia/Tokyo'
    },
    'IN': {
        countryName: 'India',
        primaryTimezone: 'Asia/Kolkata', // India Standard Time
        utcOffset: 5.5,
        businessTimezone: 'Asia/Kolkata'
    },
    'AU': {
        countryName: 'Australia',
        primaryTimezone: 'Australia/Sydney', // AEST (business center)
        utcOffset: 10,
        businessTimezone: 'Australia/Sydney'
    },

    // Africa
    'ZA': {
        countryName: 'South Africa',
        primaryTimezone: 'Africa/Johannesburg',
        utcOffset: 2,
        businessTimezone: 'Africa/Johannesburg'
    },

    // Additional common countries for comprehensive coverage
    'DE': {
        countryName: 'Germany',
        primaryTimezone: 'Europe/Berlin',
        utcOffset: 1,
        businessTimezone: 'Europe/Berlin'
    },
    'FR': {
        countryName: 'France',
        primaryTimezone: 'Europe/Paris',
        utcOffset: 1,
        businessTimezone: 'Europe/Paris'
    },
    'IT': {
        countryName: 'Italy',
        primaryTimezone: 'Europe/Rome',
        utcOffset: 1,
        businessTimezone: 'Europe/Rome'
    },
    'ES': {
        countryName: 'Spain',
        primaryTimezone: 'Europe/Madrid',
        utcOffset: 1,
        businessTimezone: 'Europe/Madrid'
    },
    'MX': {
        countryName: 'Mexico',
        primaryTimezone: 'America/Mexico_City',
        utcOffset: -6,
        businessTimezone: 'America/Mexico_City'
    },
    'AR': {
        countryName: 'Argentina',
        primaryTimezone: 'America/Argentina/Buenos_Aires',
        utcOffset: -3,
        businessTimezone: 'America/Argentina/Buenos_Aires'
    },
    'KR': {
        countryName: 'South Korea',
        primaryTimezone: 'Asia/Seoul',
        utcOffset: 9,
        businessTimezone: 'Asia/Seoul'
    },
    'SG': {
        countryName: 'Singapore',
        primaryTimezone: 'Asia/Singapore',
        utcOffset: 8,
        businessTimezone: 'Asia/Singapore'
    },
    'HK': {
        countryName: 'Hong Kong',
        primaryTimezone: 'Asia/Hong_Kong',
        utcOffset: 8,
        businessTimezone: 'Asia/Hong_Kong'
    },
    'TH': {
        countryName: 'Thailand',
        primaryTimezone: 'Asia/Bangkok',
        utcOffset: 7,
        businessTimezone: 'Asia/Bangkok'
    }
};

/**
 * SFMC server timezone configuration
 * SFMC operates on Central Standard Time (CST) which is UTC-6
 * Note: SFMC does not adjust for daylight saving time
 */
const SFMC_TIMEZONE = {
    timezone: 'America/Chicago',
    utcOffset: -6, // CST (UTC-6)
    name: 'Central Standard Time',
    isDaylightSavingAdjusted: false // SFMC uses fixed CST
};

class TimezoneCalculator {
    constructor() {
        this.countryTimezoneMap = COUNTRY_TIMEZONE_MAP;
        this.sfmcTimezone = SFMC_TIMEZONE;
        this.defaultTimezone = 'America/Chicago'; // Default to SFMC timezone
    }

    /**
     * Gets timezone information for a given country code
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {Object|null} Timezone information or null if not found
     */
    getTimezoneInfo(countryCode) {
        if (!countryCode || typeof countryCode !== 'string') {
            return null;
        }

        const upperCountryCode = countryCode.toUpperCase();
        return this.countryTimezoneMap[upperCountryCode] || null;
    }

    /**
     * Gets the timezone offset for a given country code
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {number} UTC offset in hours (e.g., -5 for EST, 8 for CST China)
     */
    getTimezoneOffset(countryCode) {
        const timezoneInfo = this.getTimezoneInfo(countryCode);
        if (!timezoneInfo) {
            console.warn(`Timezone not found for country code: ${countryCode}, using default`);
            return this.sfmcTimezone.utcOffset;
        }
        return timezoneInfo.utcOffset;
    }

    /**
     * Gets the primary timezone string for a given country code
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {string} Timezone string (e.g., 'America/New_York')
     */
    getPrimaryTimezone(countryCode) {
        const timezoneInfo = this.getTimezoneInfo(countryCode);
        if (!timezoneInfo) {
            console.warn(`Timezone not found for country code: ${countryCode}, using default`);
            return this.defaultTimezone;
        }
        return timezoneInfo.primaryTimezone;
    }

    /**
     * Gets all supported country codes
     * @returns {Array<string>} Array of supported ISO 3166-1 alpha-2 country codes
     */
    getSupportedCountries() {
        return Object.keys(this.countryTimezoneMap);
    }

    /**
     * Gets detailed information about all supported countries and their timezones
     * @returns {Array<Object>} Array of country timezone objects
     */
    getSupportedCountriesDetailed() {
        return Object.entries(this.countryTimezoneMap).map(([code, info]) => ({
            countryCode: code,
            ...info
        }));
    }

    /**
     * Validates if a country code is supported
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @returns {boolean} True if supported, false otherwise
     */
    isCountrySupported(countryCode) {
        if (!countryCode || typeof countryCode !== 'string') {
            return false;
        }
        return this.countryTimezoneMap.hasOwnProperty(countryCode.toUpperCase());
    }

    /**
     * Gets the current UTC offset for a timezone, accounting for daylight saving time
     * @param {string} timezone - Timezone string (e.g., 'America/New_York')
     * @param {Date} date - Date to check offset for (defaults to current date)
     * @returns {number} Current UTC offset in hours
     */
    getCurrentUtcOffset(timezone, date = new Date()) {
        try {
            const momentDate = moment.tz(date, timezone);
            return momentDate.utcOffset() / 60; // Convert minutes to hours
        } catch (error) {
            console.error(`Error getting UTC offset for timezone ${timezone}:`, error);
            return this.sfmcTimezone.utcOffset;
        }
    }

    /**
     * Gets the current UTC offset for a country, accounting for daylight saving time
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Date} date - Date to check offset for (defaults to current date)
     * @returns {number} Current UTC offset in hours
     */
    getCurrentCountryOffset(countryCode, date = new Date()) {
        const timezone = this.getPrimaryTimezone(countryCode);
        return this.getCurrentUtcOffset(timezone, date);
    }

    /**
     * Converts a local time to SFMC server time (CST/UTC-6)
     * SFMC operates on fixed Central Standard Time without daylight saving adjustments
     * @param {Date} localTime - Local time to convert
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code for the local time
     * @returns {Date} Time converted to SFMC server time (CST)
     */
    convertToSFMCTime(localTime, countryCode) {
        if (!localTime || !(localTime instanceof Date)) {
            throw new Error('Invalid local time provided');
        }

        try {
            // Get the timezone for the country
            const timezone = this.getPrimaryTimezone(countryCode);
            
            // Create moment object in the local timezone
            const localMoment = moment.tz(localTime, timezone);
            
            // Convert to SFMC timezone (CST - fixed UTC-6)
            // Note: We use 'America/Chicago' but treat it as fixed CST without DST
            const sfmcMoment = localMoment.clone().utc().subtract(6, 'hours');
            
            return sfmcMoment.toDate();
        } catch (error) {
            console.error(`Error converting time to SFMC timezone for country ${countryCode}:`, error);
            // Fallback: assume local time is already in SFMC timezone
            return new Date(localTime);
        }
    }

    /**
     * Converts SFMC server time to local time for a specific country
     * @param {Date} sfmcTime - Time in SFMC server timezone (CST)
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code for target timezone
     * @returns {Date} Time converted to local timezone
     */
    convertFromSFMCTime(sfmcTime, countryCode) {
        if (!sfmcTime || !(sfmcTime instanceof Date)) {
            throw new Error('Invalid SFMC time provided');
        }

        try {
            // Get the timezone for the country
            const timezone = this.getPrimaryTimezone(countryCode);
            
            // Create moment object treating input as SFMC time (UTC-6)
            const sfmcMoment = moment.utc(sfmcTime).add(6, 'hours');
            
            // Convert to local timezone
            const localMoment = sfmcMoment.tz(timezone);
            
            return localMoment.toDate();
        } catch (error) {
            console.error(`Error converting SFMC time to local timezone for country ${countryCode}:`, error);
            // Fallback: return original time
            return new Date(sfmcTime);
        }
    }

    /**
     * Calculates the timezone offset difference between a country and SFMC server time
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Date} date - Date to calculate offset for (defaults to current date)
     * @returns {number} Offset difference in hours (positive means country is ahead of SFMC)
     */
    getOffsetFromSFMC(countryCode, date = new Date()) {
        try {
            const countryOffset = this.getCurrentCountryOffset(countryCode, date);
            const sfmcOffset = this.sfmcTimezone.utcOffset; // Fixed -6
            
            return countryOffset - sfmcOffset;
        } catch (error) {
            console.error(`Error calculating offset from SFMC for country ${countryCode}:`, error);
            return 0; // No offset if calculation fails
        }
    }

    /**
     * Adjusts a time by adding/subtracting hours to account for timezone differences
     * @param {Date} baseTime - Base time to adjust
     * @param {number} offsetHours - Hours to add (positive) or subtract (negative)
     * @returns {Date} Adjusted time
     */
    adjustTimeByOffset(baseTime, offsetHours) {
        if (!baseTime || !(baseTime instanceof Date)) {
            throw new Error('Invalid base time provided');
        }

        const adjustedTime = new Date(baseTime);
        adjustedTime.setHours(adjustedTime.getHours() + offsetHours);
        return adjustedTime;
    }

    /**
     * Converts a time from one country's timezone to another country's timezone
     * @param {Date} time - Time to convert
     * @param {string} fromCountryCode - Source country code
     * @param {string} toCountryCode - Target country code
     * @returns {Date} Converted time
     */
    convertBetweenCountries(time, fromCountryCode, toCountryCode) {
        if (!time || !(time instanceof Date)) {
            throw new Error('Invalid time provided');
        }

        try {
            const fromTimezone = this.getPrimaryTimezone(fromCountryCode);
            const toTimezone = this.getPrimaryTimezone(toCountryCode);
            
            // Create moment in source timezone
            const sourceMoment = moment.tz(time, fromTimezone);
            
            // Convert to target timezone
            const targetMoment = sourceMoment.tz(toTimezone);
            
            return targetMoment.toDate();
        } catch (error) {
            console.error(`Error converting time between countries ${fromCountryCode} -> ${toCountryCode}:`, error);
            return new Date(time);
        }
    }

    /**
     * Gets a formatted string representation of timezone offset
     * @param {number} offsetHours - Offset in hours
     * @returns {string} Formatted offset string (e.g., "+05:30", "-06:00")
     */
    formatTimezoneOffset(offsetHours) {
        const sign = offsetHours >= 0 ? '+' : '-';
        const absOffset = Math.abs(offsetHours);
        const hours = Math.floor(absOffset);
        const minutes = Math.round((absOffset - hours) * 60);
        
        return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * Gets timezone information summary for debugging and logging
     * @param {string} countryCode - ISO 3166-1 alpha-2 country code
     * @param {Date} date - Date to get info for (defaults to current date)
     * @returns {Object} Timezone summary object
     */
    getTimezoneSummary(countryCode, date = new Date()) {
        const timezoneInfo = this.getTimezoneInfo(countryCode);
        const currentOffset = this.getCurrentCountryOffset(countryCode, date);
        const offsetFromSFMC = this.getOffsetFromSFMC(countryCode, date);
        
        return {
            countryCode: countryCode.toUpperCase(),
            countryName: timezoneInfo?.countryName || 'Unknown',
            timezone: this.getPrimaryTimezone(countryCode),
            currentUtcOffset: currentOffset,
            formattedOffset: this.formatTimezoneOffset(currentOffset),
            offsetFromSFMC: offsetFromSFMC,
            sfmcOffset: this.sfmcTimezone.utcOffset,
            isSupported: this.isCountrySupported(countryCode),
            date: date.toISOString()
        };
    }
}

module.exports = {
    TimezoneCalculator,
    COUNTRY_TIMEZONE_MAP,
    SFMC_TIMEZONE
};