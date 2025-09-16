/**
 * Test suite for TimezoneValidator
 */

const { TimezoneValidator, ValidationResult } = require('../src/timezone-validator');

describe('TimezoneValidator', () => {
    let validator;
    let mockLogger;

    beforeEach(() => {
        mockLogger = {
            warn: jest.fn(),
            error: jest.fn(),
            info: jest.fn(),
            debug: jest.fn()
        };
        validator = new TimezoneValidator(mockLogger);
    });

    describe('Country Code Validation', () => {
        test('should validate correct country codes', () => {
            const validCodes = ['US', 'BR', 'JP', 'GB', 'AU'];
            
            validCodes.forEach(code => {
                const result = validator.validateCountryCode(code);
                expect(result.isValid).toBe(true);
                expect(result.countryCode).toBe(code);
                expect(result.fallbackUsed).toBe(false);
                expect(result.message).toBe('Country code is valid');
            });
        });

        test('should handle case insensitive validation', () => {
            const testCases = ['us', 'US', 'Us', 'uS'];
            
            testCases.forEach(code => {
                const result = validator.validateCountryCode(code);
                expect(result.isValid).toBe(true);
                expect(result.countryCode).toBe('US');
            });
        });

        test('should handle null and undefined country codes', () => {
            const invalidInputs = [null, undefined];
            
            invalidInputs.forEach(input => {
                const result = validator.validateCountryCode(input);
                expect(result.isValid).toBe(false);
                expect(result.fallbackUsed).toBe(true);
                expect(result.fallbackValue).toBe('US');
                expect(result.message).toBe('Country code is null or undefined');
            });
        });

        test('should handle non-string country codes', () => {
            const invalidInputs = [123, {}, [], true];
            
            invalidInputs.forEach(input => {
                const result = validator.validateCountryCode(input);
                expect(result.isValid).toBe(false);
                expect(result.fallbackUsed).toBe(true);
                expect(result.message).toContain('Country code must be a string');
            });
        });

        test('should handle empty and whitespace-only country codes', () => {
            const emptyInputs = ['', '  ', '\t', '\n'];
            
            emptyInputs.forEach(input => {
                const result = validator.validateCountryCode(input);
                expect(result.isValid).toBe(false);
                expect(result.fallbackUsed).toBe(true);
                if (input === '') {
                    expect(result.message).toBe('Country code is null or undefined');
                } else {
                    expect(result.message).toBe('Country code is empty after trimming');
                }
            });
        });

        test('should handle incorrect length country codes', () => {
            const incorrectLengthCodes = ['U', 'USA', 'UNITED'];
            
            incorrectLengthCodes.forEach(code => {
                const result = validator.validateCountryCode(code);
                expect(result.isValid).toBe(false);
                expect(result.fallbackUsed).toBe(true);
                expect(result.message).toContain('Country code must be 2 characters');
            });
        });

        test('should handle non-alphabetic country codes', () => {
            const nonAlphabeticCodes = ['12', 'U1', '1S', 'U@', 'A1'];
            
            nonAlphabeticCodes.forEach(code => {
                const result = validator.validateCountryCode(code);
                expect(result.isValid).toBe(false);
                expect(result.fallbackUsed).toBe(true);
                expect(result.message).toContain('Country code must contain only letters');
            });
        });

        test('should handle unsupported country codes', () => {
            const unsupportedCodes = ['XX', 'ZZ', 'QQ'];
            
            unsupportedCodes.forEach(code => {
                const result = validator.validateCountryCode(code);
                expect(result.isValid).toBe(false);
                expect(result.fallbackUsed).toBe(true);
                expect(result.message).toContain('is not supported');
            });
        });

        test('should use custom fallback country', () => {
            const result = validator.validateCountryCode('XX', { fallbackCountry: 'BR' });
            expect(result.isValid).toBe(false);
            expect(result.fallbackUsed).toBe(true);
            expect(result.fallbackValue).toBe('BR');
        });

        test('should respect logging options', () => {
            validator.validateCountryCode('XX', { logIssues: false });
            expect(mockLogger.warn).not.toHaveBeenCalled();

            validator.validateCountryCode('XX', { logIssues: true });
            expect(mockLogger.warn).toHaveBeenCalled();
        });
    });

    describe('Validated Timezone Info', () => {
        test('should return timezone info for valid country codes', () => {
            const result = validator.getValidatedTimezoneInfo('US');
            
            expect(result.validation.isValid).toBe(true);
            expect(result.timezoneInfo).toBeDefined();
            expect(result.timezoneInfo.countryName).toBe('United States');
            expect(result.timezoneSummary).toBeDefined();
            expect(result.effectiveCountryCode).toBe('US');
        });

        test('should return fallback timezone info for invalid country codes', () => {
            const result = validator.getValidatedTimezoneInfo('XX');
            
            expect(result.validation.isValid).toBe(false);
            expect(result.validation.fallbackUsed).toBe(true);
            expect(result.timezoneInfo).toBeDefined();
            expect(result.effectiveCountryCode).toBe('US'); // Default fallback
        });

        test('should handle ultimate fallback scenario', () => {
            // Mock an error in timezone calculation to trigger ultimate fallback
            const originalGetTimezoneInfo = validator.timezoneCalculator.getTimezoneInfo;
            validator.timezoneCalculator.getTimezoneInfo = jest.fn(() => {
                throw new Error('Timezone calculation error');
            });

            const result = validator.getValidatedTimezoneInfo('US');
            
            expect(result.ultimateFallback).toBe(true);
            expect(result.timezoneInfo.countryName).toBe('Default (SFMC)');
            expect(result.timezoneInfo.primaryTimezone).toBe('America/Chicago');

            // Restore original method
            validator.timezoneCalculator.getTimezoneInfo = originalGetTimezoneInfo;
        });
    });

    describe('Timezone String Validation', () => {
        test('should validate correct timezone strings', () => {
            const validTimezones = [
                'America/New_York',
                'Europe/London',
                'Asia/Tokyo',
                'Australia/Sydney'
            ];
            
            validTimezones.forEach(timezone => {
                const isValid = validator.validateTimezone(timezone);
                expect(isValid).toBe(true);
            });
        });

        test('should reject invalid timezone strings', () => {
            const invalidTimezones = [
                'Invalid/Timezone',
                'Not_A_Timezone',
                '',
                null,
                undefined,
                123
            ];
            
            invalidTimezones.forEach(timezone => {
                const isValid = validator.validateTimezone(timezone);
                expect(isValid).toBe(false);
            });
        });
    });

    describe('Validation Statistics', () => {
        test('should track validation statistics correctly', () => {
            // Perform some validations
            validator.validateCountryCode('US'); // Valid
            validator.validateCountryCode('BR'); // Valid
            validator.validateCountryCode('XX'); // Invalid, fallback used
            validator.validateCountryCode(null); // Invalid, fallback used

            const stats = validator.getValidationStats();
            
            expect(stats.totalValidations).toBe(4);
            expect(stats.validCodes).toBe(2);
            expect(stats.invalidCodes).toBe(2);
            expect(stats.fallbacksUsed).toBe(2);
            expect(stats.successRate).toBe('50.00%');
            expect(stats.fallbackRate).toBe('50.00%');
        });

        test('should reset statistics correctly', () => {
            validator.validateCountryCode('US');
            validator.resetValidationStats();
            
            const stats = validator.getValidationStats();
            expect(stats.totalValidations).toBe(0);
            expect(stats.validCodes).toBe(0);
            expect(stats.invalidCodes).toBe(0);
            expect(stats.fallbacksUsed).toBe(0);
        });

        test('should handle zero validations in statistics', () => {
            const stats = validator.getValidationStats();
            expect(stats.successRate).toBe('0%');
            expect(stats.fallbackRate).toBe('0%');
        });
    });

    describe('Default Fallback Country Management', () => {
        test('should set valid default fallback country', () => {
            const success = validator.setDefaultFallbackCountry('BR');
            expect(success).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('Default fallback country set to: BR');
        });

        test('should reject invalid default fallback country', () => {
            const success = validator.setDefaultFallbackCountry('XX');
            expect(success).toBe(false);
            expect(mockLogger.warn).toHaveBeenCalledWith('Cannot set invalid country code as default fallback: XX');
        });

        test('should use new default fallback country', () => {
            validator.setDefaultFallbackCountry('BR');
            const result = validator.validateCountryCode('XX');
            expect(result.fallbackValue).toBe('BR');
        });
    });

    describe('Common Issues and Solutions', () => {
        test('should provide common issues and solutions', () => {
            const issues = validator.getCommonIssuesAndSolutions();
            
            expect(Array.isArray(issues)).toBe(true);
            expect(issues.length).toBeGreaterThan(0);
            
            issues.forEach(issue => {
                expect(issue).toHaveProperty('issue');
                expect(issue).toHaveProperty('solution');
                expect(issue).toHaveProperty('fallback');
            });

            // Check for specific expected issues
            const nullIssue = issues.find(i => i.issue.includes('null or undefined'));
            expect(nullIssue).toBeDefined();
            
            const lengthIssue = issues.find(i => i.issue.includes('2 characters'));
            expect(lengthIssue).toBeDefined();
        });
    });

    describe('Timezone Issue Logging', () => {
        test('should log timezone issues correctly', () => {
            const validation = new ValidationResult(false, 'US', 'Test issue', true, 'US');
            const context = { subscriberKey: '12345', journey: 'test-journey' };
            
            validator.logTimezoneIssue('XX', validation, context);
            
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Timezone mapping issue detected:',
                expect.objectContaining({
                    originalCountryCode: 'XX',
                    validation,
                    context
                })
            );
        });

        test('should log successful validations as debug', () => {
            const validation = new ValidationResult(true, 'US', 'Valid', false, null);
            
            validator.logTimezoneIssue('US', validation);
            
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Timezone validation successful:',
                expect.any(Object)
            );
        });
    });

    describe('Error Handling', () => {
        test('should handle errors during validation gracefully', () => {
            // Mock an error in the timezone calculator
            const originalIsCountrySupported = validator.timezoneCalculator.isCountrySupported;
            validator.timezoneCalculator.isCountrySupported = jest.fn(() => {
                throw new Error('Test error');
            });

            const result = validator.validateCountryCode('US');
            
            expect(result.isValid).toBe(false);
            expect(result.fallbackUsed).toBe(true);
            expect(result.message).toContain('Error during country code validation');
            expect(mockLogger.error).toHaveBeenCalled();

            // Restore original method
            validator.timezoneCalculator.isCountrySupported = originalIsCountrySupported;
        });
    });

    describe('ValidationResult Class', () => {
        test('should create ValidationResult with all properties', () => {
            const result = new ValidationResult(true, 'US', 'Test message', false, null);
            
            expect(result.isValid).toBe(true);
            expect(result.countryCode).toBe('US');
            expect(result.message).toBe('Test message');
            expect(result.fallbackUsed).toBe(false);
            expect(result.fallbackValue).toBeNull();
            expect(result.timestamp).toBeDefined();
            expect(typeof result.timestamp).toBe('string');
        });

        test('should create ValidationResult with default values', () => {
            const result = new ValidationResult(false, 'XX');
            
            expect(result.isValid).toBe(false);
            expect(result.countryCode).toBe('XX');
            expect(result.message).toBe('');
            expect(result.fallbackUsed).toBe(false);
            expect(result.fallbackValue).toBeNull();
        });
    });
});