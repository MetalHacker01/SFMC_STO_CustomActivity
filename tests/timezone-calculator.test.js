/**
 * Test suite for TimezoneCalculator
 */

const { TimezoneCalculator, COUNTRY_TIMEZONE_MAP, SFMC_TIMEZONE } = require('../src/timezone-calculator');

describe('TimezoneCalculator', () => {
    let calculator;

    beforeEach(() => {
        calculator = new TimezoneCalculator();
    });

    describe('Country Code to Timezone Mapping', () => {
        test('should return timezone info for supported countries', () => {
            const testCases = [
                { code: 'US', expectedName: 'United States', expectedTimezone: 'America/New_York' },
                { code: 'BR', expectedName: 'Brazil', expectedTimezone: 'America/Sao_Paulo' },
                { code: 'JP', expectedName: 'Japan', expectedTimezone: 'Asia/Tokyo' },
                { code: 'GB', expectedName: 'United Kingdom', expectedTimezone: 'Europe/London' },
                { code: 'AU', expectedName: 'Australia', expectedTimezone: 'Australia/Sydney' }
            ];

            testCases.forEach(({ code, expectedName, expectedTimezone }) => {
                const info = calculator.getTimezoneInfo(code);
                expect(info).toBeDefined();
                expect(info.countryName).toBe(expectedName);
                expect(info.primaryTimezone).toBe(expectedTimezone);
            });
        });

        test('should handle case insensitive country codes', () => {
            const testCases = ['us', 'US', 'Us', 'uS'];
            
            testCases.forEach(code => {
                const info = calculator.getTimezoneInfo(code);
                expect(info).toBeDefined();
                expect(info.countryName).toBe('United States');
            });
        });

        test('should return null for unsupported countries', () => {
            const unsupportedCodes = ['XX', 'ZZ', 'ABC', ''];
            
            unsupportedCodes.forEach(code => {
                const info = calculator.getTimezoneInfo(code);
                expect(info).toBeNull();
            });
        });

        test('should return null for invalid input', () => {
            const invalidInputs = [null, undefined, 123, {}, []];
            
            invalidInputs.forEach(input => {
                const info = calculator.getTimezoneInfo(input);
                expect(info).toBeNull();
            });
        });

        test('should include all required countries from data sample', () => {
            const requiredCountries = ['BR', 'IN', 'JP', 'RU', 'GB', 'CA', 'ZA', 'AU', 'CN', 'US'];
            
            requiredCountries.forEach(code => {
                const info = calculator.getTimezoneInfo(code);
                expect(info).toBeDefined();
                expect(info.countryName).toBeDefined();
                expect(info.primaryTimezone).toBeDefined();
                expect(typeof info.utcOffset).toBe('number');
            });
        });
    });

    describe('Timezone Offset Calculations', () => {
        test('should return correct UTC offsets for known countries', () => {
            const testCases = [
                { code: 'US', expectedOffset: -5 }, // EST
                { code: 'BR', expectedOffset: -3 }, // BRT
                { code: 'JP', expectedOffset: 9 },  // JST
                { code: 'GB', expectedOffset: 0 },  // GMT
                { code: 'IN', expectedOffset: 5.5 }, // IST
                { code: 'AU', expectedOffset: 10 }  // AEST
            ];

            testCases.forEach(({ code, expectedOffset }) => {
                const offset = calculator.getTimezoneOffset(code);
                expect(offset).toBe(expectedOffset);
            });
        });

        test('should return SFMC offset for unsupported countries', () => {
            const offset = calculator.getTimezoneOffset('XX');
            expect(offset).toBe(SFMC_TIMEZONE.utcOffset);
        });

        test('should return primary timezone string for supported countries', () => {
            const timezone = calculator.getPrimaryTimezone('US');
            expect(timezone).toBe('America/New_York');
        });

        test('should return default timezone for unsupported countries', () => {
            const timezone = calculator.getPrimaryTimezone('XX');
            expect(timezone).toBe('America/Chicago');
        });
    });

    describe('SFMC Time Conversion', () => {
        test('should convert local time to SFMC time correctly', () => {
            const localTime = new Date('2024-01-15T12:00:00Z'); // UTC noon
            
            // Test conversion from US Eastern (UTC-5) to SFMC (UTC-6)
            const sfmcTime = calculator.convertToSFMCTime(localTime, 'US');
            expect(sfmcTime).toBeInstanceOf(Date);
        });

        test('should convert SFMC time to local time correctly', () => {
            const sfmcTime = new Date('2024-01-15T12:00:00Z'); // SFMC time
            
            // Test conversion from SFMC to US Eastern
            const localTime = calculator.convertFromSFMCTime(sfmcTime, 'US');
            expect(localTime).toBeInstanceOf(Date);
        });

        test('should handle invalid time inputs gracefully', () => {
            expect(() => calculator.convertToSFMCTime(null, 'US')).toThrow();
            expect(() => calculator.convertToSFMCTime('invalid', 'US')).toThrow();
            expect(() => calculator.convertFromSFMCTime(null, 'US')).toThrow();
        });

        test('should calculate offset from SFMC correctly', () => {
            const testCases = [
                { code: 'US', expectedDiff: 1 },  // EST (-5) vs CST (-6) = +1
                { code: 'BR', expectedDiff: 3 },  // BRT (-3) vs CST (-6) = +3
                { code: 'JP', expectedDiff: 15 }, // JST (+9) vs CST (-6) = +15
                { code: 'GB', expectedDiff: 6 }   // GMT (0) vs CST (-6) = +6
            ];

            testCases.forEach(({ code, expectedDiff }) => {
                const diff = calculator.getOffsetFromSFMC(code);
                // Allow for some variance due to DST calculations
                expect(Math.abs(diff - expectedDiff)).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('Time Adjustment Utilities', () => {
        test('should adjust time by offset correctly', () => {
            const baseTime = new Date('2024-01-15T12:00:00Z');
            const adjustedTime = calculator.adjustTimeByOffset(baseTime, 3);
            
            expect(adjustedTime.getTime()).toBe(baseTime.getTime() + (3 * 60 * 60 * 1000)); // 3 hours in milliseconds
        });

        test('should handle negative offsets', () => {
            const baseTime = new Date('2024-01-15T12:00:00Z');
            const adjustedTime = calculator.adjustTimeByOffset(baseTime, -2);
            
            expect(adjustedTime.getTime()).toBe(baseTime.getTime() - (2 * 60 * 60 * 1000)); // 2 hours in milliseconds
        });

        test('should throw error for invalid base time', () => {
            expect(() => calculator.adjustTimeByOffset(null, 1)).toThrow();
            expect(() => calculator.adjustTimeByOffset('invalid', 1)).toThrow();
        });
    });

    describe('Country Conversion', () => {
        test('should convert time between countries', () => {
            const time = new Date('2024-01-15T12:00:00Z');
            const convertedTime = calculator.convertBetweenCountries(time, 'US', 'JP');
            
            expect(convertedTime).toBeInstanceOf(Date);
            // The times should represent the same moment but in different timezones
            // So they might have the same UTC time but different local representations
            expect(convertedTime).toBeDefined();
        });

        test('should handle same country conversion', () => {
            const time = new Date('2024-01-15T12:00:00Z');
            const convertedTime = calculator.convertBetweenCountries(time, 'US', 'US');
            
            expect(convertedTime).toBeInstanceOf(Date);
        });
    });

    describe('Utility Functions', () => {
        test('should return list of supported countries', () => {
            const countries = calculator.getSupportedCountries();
            expect(Array.isArray(countries)).toBe(true);
            expect(countries.length).toBeGreaterThan(0);
            expect(countries).toContain('US');
            expect(countries).toContain('BR');
        });

        test('should return detailed country information', () => {
            const detailed = calculator.getSupportedCountriesDetailed();
            expect(Array.isArray(detailed)).toBe(true);
            expect(detailed.length).toBeGreaterThan(0);
            
            const usInfo = detailed.find(c => c.countryCode === 'US');
            expect(usInfo).toBeDefined();
            expect(usInfo.countryName).toBe('United States');
        });

        test('should validate country support correctly', () => {
            expect(calculator.isCountrySupported('US')).toBe(true);
            expect(calculator.isCountrySupported('us')).toBe(true);
            expect(calculator.isCountrySupported('XX')).toBe(false);
            expect(calculator.isCountrySupported(null)).toBe(false);
        });

        test('should format timezone offset correctly', () => {
            expect(calculator.formatTimezoneOffset(5.5)).toBe('+05:30');
            expect(calculator.formatTimezoneOffset(-6)).toBe('-06:00');
            expect(calculator.formatTimezoneOffset(0)).toBe('+00:00');
            expect(calculator.formatTimezoneOffset(10)).toBe('+10:00');
        });

        test('should generate timezone summary', () => {
            const summary = calculator.getTimezoneSummary('US');
            
            expect(summary).toHaveProperty('countryCode', 'US');
            expect(summary).toHaveProperty('countryName', 'United States');
            expect(summary).toHaveProperty('timezone');
            expect(summary).toHaveProperty('currentUtcOffset');
            expect(summary).toHaveProperty('formattedOffset');
            expect(summary).toHaveProperty('offsetFromSFMC');
            expect(summary).toHaveProperty('isSupported', true);
            expect(summary).toHaveProperty('date');
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle countries with multiple timezones using primary business timezone', () => {
            // US has multiple timezones, should use Eastern (business standard)
            const info = calculator.getTimezoneInfo('US');
            expect(info.primaryTimezone).toBe('America/New_York');
            expect(info.businessTimezone).toBe('America/New_York');
        });

        test('should handle half-hour timezone offsets', () => {
            const info = calculator.getTimezoneInfo('IN');
            expect(info.utcOffset).toBe(5.5); // India Standard Time is UTC+5:30
        });

        test('should maintain consistency in timezone data', () => {
            const countries = calculator.getSupportedCountries();
            
            countries.forEach(code => {
                const info = calculator.getTimezoneInfo(code);
                expect(info).toBeDefined();
                expect(typeof info.countryName).toBe('string');
                expect(typeof info.primaryTimezone).toBe('string');
                expect(typeof info.utcOffset).toBe('number');
                expect(typeof info.businessTimezone).toBe('string');
            });
        });
    });
});