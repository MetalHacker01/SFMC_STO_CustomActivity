/**
 * Test suite for TimezoneEngine
 */

const { TimezoneEngine } = require('../src/timezone-engine');

describe('TimezoneEngine', () => {
    let engine;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
        };
        engine = new TimezoneEngine(mockLogger);
    });

    describe('Initialization', () => {
        test('should initialize with default options', () => {
            const stats = engine.getEngineStats();
            expect(stats.configuration.defaultFallbackCountry).toBe('US');
            expect(stats.configuration.logValidationIssues).toBe(true);
        });

        test('should initialize with custom options', () => {
            const customEngine = new TimezoneEngine(mockLogger, {
                defaultFallbackCountry: 'BR',
                logValidationIssues: false,
                enableDetailedLogging: true
            });
            
            const stats = customEngine.getEngineStats();
            expect(stats.configuration.defaultFallbackCountry).toBe('BR');
            expect(stats.configuration.logValidationIssues).toBe(false);
            expect(stats.configuration.enableDetailedLogging).toBe(true);
        });
    });

    describe('Timezone Information Retrieval', () => {
        test('should get timezone info for valid country codes', () => {
            const result = engine.getTimezoneInfo('US');
            
            expect(result.success).toBe(true);
            expect(result.countryCode).toBe('US');
            expect(result.validation.isValid).toBe(true);
            expect(result.timezone.countryName).toBe('United States');
            expect(result.summary).toBeDefined();
            expect(result.ultimateFallback).toBe(false);
        });

        test('should handle invalid country codes with fallback', () => {
            const result = engine.getTimezoneInfo('XX');
            
            expect(result.success).toBe(true);
            expect(result.countryCode).toBe('US'); // Default fallback
            expect(result.validation.isValid).toBe(false);
            expect(result.validation.fallbackUsed).toBe(true);
            expect(result.ultimateFallback).toBe(false);
        });

        test('should include context in logging', () => {
            const context = { subscriberKey: '12345', journey: 'test-journey' };
            engine.getTimezoneInfo('XX', context);
            
            // Should log the validation issue with context
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    describe('SFMC Time Conversion', () => {
        test('should convert local time to SFMC time successfully', () => {
            const localTime = new Date('2024-01-15T12:00:00Z');
            const result = engine.convertToSFMCTime(localTime, 'US');
            
            expect(result.success).toBe(true);
            expect(result.originalTime).toEqual(localTime);
            expect(result.sfmcTime).toBeInstanceOf(Date);
            expect(result.countryCode).toBe('US');
            expect(result.timezone).toBeDefined();
            expect(result.validation).toBeDefined();
            expect(typeof result.offsetFromSFMC).toBe('number');
        });

        test('should handle invalid local time input', () => {
            const result = engine.convertToSFMCTime(null, 'US');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid local time provided');
            expect(result.sfmcTime).toBeNull();
        });

        test('should convert SFMC time to local time successfully', () => {
            const sfmcTime = new Date('2024-01-15T12:00:00Z');
            const result = engine.convertFromSFMCTime(sfmcTime, 'US');
            
            expect(result.success).toBe(true);
            expect(result.sfmcTime).toEqual(sfmcTime);
            expect(result.localTime).toBeInstanceOf(Date);
            expect(result.countryCode).toBe('US');
            expect(result.timezone).toBeDefined();
            expect(result.validation).toBeDefined();
        });

        test('should handle invalid SFMC time input', () => {
            const result = engine.convertFromSFMCTime('invalid', 'US');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid SFMC time provided');
            expect(result.localTime).toBeNull();
        });

        test('should use fallback country for invalid country codes', () => {
            const localTime = new Date('2024-01-15T12:00:00Z');
            const result = engine.convertToSFMCTime(localTime, 'XX');
            
            expect(result.success).toBe(true);
            expect(result.countryCode).toBe('US'); // Fallback
            expect(result.validation.fallbackUsed).toBe(true);
        });
    });

    describe('Timezone Summary', () => {
        test('should get comprehensive timezone summary', () => {
            const date = new Date('2024-01-15T12:00:00Z');
            const result = engine.getTimezoneSummary('US', date);
            
            expect(result.success).toBe(true);
            expect(result.countryCode).toBe('US');
            expect(result.countryName).toBe('United States');
            expect(result.timezone).toBeDefined();
            expect(result.currentUtcOffset).toBeDefined();
            expect(result.formattedOffset).toBeDefined();
            expect(result.offsetFromSFMC).toBeDefined();
            expect(result.validation).toBeDefined();
            expect(result.fallbackUsed).toBe(false);
        });

        test('should handle invalid country in summary', () => {
            const result = engine.getTimezoneSummary('XX');
            
            expect(result.success).toBe(true);
            expect(result.fallbackUsed).toBe(true);
            expect(result.validation.fallbackUsed).toBe(true);
        });
    });

    describe('Multiple Country Validation', () => {
        test('should validate multiple countries successfully', () => {
            const countries = ['US', 'BR', 'XX', 'JP'];
            const result = engine.validateMultipleCountries(countries);
            
            expect(result.success).toBe(true);
            expect(result.total).toBe(4);
            expect(result.valid).toBe(3); // US, BR, JP are valid
            expect(result.invalid).toBe(1); // XX is invalid
            expect(result.results).toHaveLength(4);
            
            result.results.forEach(r => {
                expect(r).toHaveProperty('originalCode');
                expect(r).toHaveProperty('validation');
            });
        });

        test('should handle non-array input', () => {
            const result = engine.validateMultipleCountries('US');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Country codes must be provided as an array');
        });

        test('should handle empty array', () => {
            const result = engine.validateMultipleCountries([]);
            
            expect(result.success).toBe(true);
            expect(result.total).toBe(0);
            expect(result.valid).toBe(0);
            expect(result.invalid).toBe(0);
        });
    });

    describe('Engine Statistics and Management', () => {
        test('should provide comprehensive engine statistics', () => {
            // Perform some operations to generate stats
            engine.getTimezoneInfo('US');
            engine.getTimezoneInfo('XX');
            
            const stats = engine.getEngineStats();
            
            expect(stats).toHaveProperty('validationStats');
            expect(stats).toHaveProperty('supportedCountries');
            expect(stats).toHaveProperty('supportedCountriesCount');
            expect(stats).toHaveProperty('configuration');
            expect(stats).toHaveProperty('sfmcTimezone');
            
            expect(Array.isArray(stats.supportedCountries)).toBe(true);
            expect(stats.supportedCountriesCount).toBeGreaterThan(0);
        });

        test('should reset engine statistics', () => {
            // Generate some stats
            engine.getTimezoneInfo('US');
            engine.getTimezoneInfo('XX');
            
            let stats = engine.getEngineStats();
            expect(stats.validationStats.totalValidations).toBeGreaterThan(0);
            
            // Reset
            engine.reset();
            
            stats = engine.getEngineStats();
            expect(stats.validationStats.totalValidations).toBe(0);
            expect(mockLogger.info).toHaveBeenCalledWith('Timezone engine reset completed');
        });

        test('should update configuration', () => {
            const newOptions = {
                defaultFallbackCountry: 'BR',
                enableDetailedLogging: true
            };
            
            engine.updateConfiguration(newOptions);
            
            const stats = engine.getEngineStats();
            expect(stats.configuration.defaultFallbackCountry).toBe('BR');
            expect(stats.configuration.enableDetailedLogging).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('Timezone engine configuration updated', expect.any(Object));
        });
    });

    describe('Troubleshooting Information', () => {
        test('should provide comprehensive troubleshooting info', () => {
            const info = engine.getTroubleshootingInfo();
            
            expect(info).toHaveProperty('commonIssues');
            expect(info).toHaveProperty('supportedCountries');
            expect(info).toHaveProperty('validationStats');
            expect(info).toHaveProperty('engineConfiguration');
            expect(info).toHaveProperty('testInstructions');
            
            expect(Array.isArray(info.commonIssues)).toBe(true);
            expect(Array.isArray(info.supportedCountries)).toBe(true);
            expect(typeof info.testInstructions).toBe('object');
        });
    });

    describe('Error Handling', () => {
        test('should handle calculator errors gracefully', () => {
            // Mock an error in the calculator
            const originalConvertToSFMCTime = engine.calculator.convertToSFMCTime;
            engine.calculator.convertToSFMCTime = jest.fn(() => {
                throw new Error('Calculator error');
            });

            const localTime = new Date('2024-01-15T12:00:00Z');
            const result = engine.convertToSFMCTime(localTime, 'US');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Calculator error');
            expect(result.sfmcTime).toEqual(localTime); // Fallback
            expect(mockLogger.error).toHaveBeenCalled();

            // Restore original method
            engine.calculator.convertToSFMCTime = originalConvertToSFMCTime;
        });

        test('should handle validator errors gracefully', () => {
            // Mock an error in the validator
            const originalGetValidatedTimezoneInfo = engine.validator.getValidatedTimezoneInfo;
            engine.validator.getValidatedTimezoneInfo = jest.fn(() => {
                throw new Error('Validator error');
            });

            const result = engine.getTimezoneInfo('US');
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Validator error');
            expect(result.ultimateFallback).toBe(true);
            expect(result.timezone.countryName).toBe('Default (SFMC)');
            expect(mockLogger.error).toHaveBeenCalled();

            // Restore original method
            engine.validator.getValidatedTimezoneInfo = originalGetValidatedTimezoneInfo;
        });
    });

    describe('Context Handling', () => {
        test('should pass context through to validation logging', () => {
            const context = {
                subscriberKey: '12345',
                journey: 'test-journey',
                activityId: 'sto-activity-1'
            };
            
            engine.getTimezoneInfo('XX', context);
            
            // Verify that context was passed to logging
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        test('should handle missing context gracefully', () => {
            const result = engine.getTimezoneInfo('US');
            
            expect(result.success).toBe(true);
            expect(result.countryCode).toBe('US');
        });
    });
});