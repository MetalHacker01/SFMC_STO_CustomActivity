/**
 * Comprehensive Unit Tests for Core Functions
 * Task 10.1: Create unit tests for core functions
 * - Write tests for timezone calculation logic
 * - Create tests for holiday checking and caching
 * - Add tests for time window processing and date adjustments
 */

const { TimezoneCalculator } = require('../src/timezone-calculator');
const HolidayChecker = require('../src/holiday-checker');
const HolidayCache = require('../src/holiday-cache');
const TimeWindowValidator = require('../src/timewindow/time-window-validator');
const TimeSlotSelector = require('../src/timewindow/time-slot-selector');
const DateAdjuster = require('../src/timewindow/date-adjuster');

// Mock external dependencies
jest.mock('../src/holiday-api');
jest.mock('../src/holiday-cache');

describe('Core Functions Unit Tests', () => {
    describe('Timezone Calculation Logic', () => {
        let timezoneCalculator;

        beforeEach(() => {
            timezoneCalculator = new TimezoneCalculator();
        });

        describe('Country Code Validation', () => {
            test('should validate ISO 3166-1 alpha-2 country codes', () => {
                const validCodes = ['US', 'BR', 'JP', 'GB', 'CA', 'AU', 'IN', 'CN', 'RU', 'ZA'];
                
                validCodes.forEach(code => {
                    expect(timezoneCalculator.isCountrySupported(code)).toBe(true);
                    expect(timezoneCalculator.getTimezoneInfo(code)).not.toBeNull();
                });
            });

            test('should reject invalid country codes', () => {
                const invalidCodes = ['', 'X', 'ABC', '12', null, undefined, {}, []];
                
                invalidCodes.forEach(code => {
                    expect(timezoneCalculator.isCountrySupported(code)).toBe(false);
                    expect(timezoneCalculator.getTimezoneInfo(code)).toBeNull();
                });
            });

            test('should handle case insensitive country codes', () => {
                const testCases = [
                    { input: 'us', expected: 'US' },
                    { input: 'Us', expected: 'US' },
                    { input: 'uS', expected: 'US' },
                    { input: 'br', expected: 'BR' },
                    { input: 'jp', expected: 'JP' }
                ];

                testCases.forEach(({ input, expected }) => {
                    const info = timezoneCalculator.getTimezoneInfo(input);
                    expect(info).not.toBeNull();
                    expect(info.countryCode).toBe(expected);
                });
            });
        });

        describe('Timezone Offset Calculations', () => {
            test('should calculate correct UTC offsets for all supported countries', () => {
                const expectedOffsets = {
                    'US': -5,    // EST (Eastern Standard Time)
                    'BR': -3,    // BRT (Brasilia Time)
                    'JP': 9,     // JST (Japan Standard Time)
                    'GB': 0,     // GMT (Greenwich Mean Time)
                    'IN': 5.5,   // IST (India Standard Time)
                    'AU': 10,    // AEST (Australian Eastern Standard Time)
                    'CA': -5,    // EST (same as US Eastern)
                    'CN': 8,     // CST (China Standard Time)
                    'RU': 3,     // MSK (Moscow Standard Time)
                    'ZA': 2      // SAST (South Africa Standard Time)
                };

                Object.entries(expectedOffsets).forEach(([country, expectedOffset]) => {
                    const actualOffset = timezoneCalculator.getTimezoneOffset(country);
                    expect(actualOffset).toBe(expectedOffset);
                });
            });

            test('should handle half-hour timezone offsets correctly', () => {
                // India Standard Time is UTC+5:30
                const offset = timezoneCalculator.getTimezoneOffset('IN');
                expect(offset).toBe(5.5);
                
                const formatted = timezoneCalculator.formatTimezoneOffset(offset);
                expect(formatted).toBe('+05:30');
            });

            test('should calculate offset from SFMC server time (CST/UTC-6)', () => {
                const testCases = [
                    { country: 'US', expectedDiff: 1 },   // EST (-5) vs CST (-6) = +1
                    { country: 'BR', expectedDiff: 3 },   // BRT (-3) vs CST (-6) = +3
                    { country: 'JP', expectedDiff: 15 },  // JST (+9) vs CST (-6) = +15
                    { country: 'GB', expectedDiff: 6 },   // GMT (0) vs CST (-6) = +6
                    { country: 'IN', expectedDiff: 11.5 } // IST (+5.5) vs CST (-6) = +11.5
                ];

                testCases.forEach(({ country, expectedDiff }) => {
                    const actualDiff = timezoneCalculator.getOffsetFromSFMC(country);
                    expect(actualDiff).toBe(expectedDiff);
                });
            });
        });

        describe('Time Conversion Logic', () => {
            test('should convert local time to SFMC time accurately', () => {
                const testDate = new Date('2024-01-15T12:00:00Z'); // UTC noon
                
                // Test US Eastern to SFMC conversion
                const sfmcTime = timezoneCalculator.convertToSFMCTime(testDate, 'US');
                expect(sfmcTime).toBeInstanceOf(Date);
                
                // EST is UTC-5, SFMC is UTC-6, so SFMC time should be 1 hour behind EST
                const expectedSFMCTime = new Date(testDate.getTime() - (1 * 60 * 60 * 1000));
                expect(sfmcTime.getTime()).toBe(expectedSFMCTime.getTime());
            });

            test('should convert SFMC time to local time accurately', () => {
                const sfmcTime = new Date('2024-01-15T12:00:00Z'); // SFMC noon
                
                // Test SFMC to US Eastern conversion
                const localTime = timezoneCalculator.convertFromSFMCTime(sfmcTime, 'US');
                expect(localTime).toBeInstanceOf(Date);
                
                // EST is UTC-5, SFMC is UTC-6, so EST time should be 1 hour ahead of SFMC
                const expectedLocalTime = new Date(sfmcTime.getTime() + (1 * 60 * 60 * 1000));
                expect(localTime.getTime()).toBe(expectedLocalTime.getTime());
            });

            test('should handle timezone conversions across date boundaries', () => {
                const lateNight = new Date('2024-01-15T23:30:00Z'); // 11:30 PM UTC
                
                // Convert to Japan time (UTC+9)
                const japanTime = timezoneCalculator.convertToSFMCTime(lateNight, 'JP');
                expect(japanTime).toBeInstanceOf(Date);
                
                // Should handle date rollover correctly
                expect(japanTime.getDate()).toBeGreaterThanOrEqual(lateNight.getDate());
            });

            test('should throw errors for invalid time inputs', () => {
                const invalidInputs = [null, undefined, 'invalid', {}, [], NaN];
                
                invalidInputs.forEach(input => {
                    expect(() => timezoneCalculator.convertToSFMCTime(input, 'US')).toThrow();
                    expect(() => timezoneCalculator.convertFromSFMCTime(input, 'US')).toThrow();
                });
            });
        });

        describe('Edge Cases and Error Handling', () => {
            test('should handle countries with multiple timezones using primary business timezone', () => {
                // US has multiple timezones, should use Eastern as primary business timezone
                const usInfo = timezoneCalculator.getTimezoneInfo('US');
                expect(usInfo.primaryTimezone).toBe('America/New_York');
                expect(usInfo.businessTimezone).toBe('America/New_York');
                
                // Russia spans 11 time zones, should use Moscow time as primary
                const ruInfo = timezoneCalculator.getTimezoneInfo('RU');
                expect(ruInfo.primaryTimezone).toBe('Europe/Moscow');
            });

            test('should provide fallback behavior for unsupported countries', () => {
                const unsupportedCountry = 'XX';
                
                // Should return SFMC timezone as fallback
                const offset = timezoneCalculator.getTimezoneOffset(unsupportedCountry);
                expect(offset).toBe(-6); // SFMC CST offset
                
                const timezone = timezoneCalculator.getPrimaryTimezone(unsupportedCountry);
                expect(timezone).toBe('America/Chicago'); // SFMC default timezone
            });

            test('should maintain consistency across all timezone operations', () => {
                const supportedCountries = timezoneCalculator.getSupportedCountries();
                
                supportedCountries.forEach(country => {
                    const info = timezoneCalculator.getTimezoneInfo(country);
                    const offset = timezoneCalculator.getTimezoneOffset(country);
                    const timezone = timezoneCalculator.getPrimaryTimezone(country);
                    
                    // All operations should return consistent data
                    expect(info).not.toBeNull();
                    expect(info.utcOffset).toBe(offset);
                    expect(info.primaryTimezone).toBe(timezone);
                    expect(typeof info.countryName).toBe('string');
                    expect(info.countryName.length).toBeGreaterThan(0);
                });
            });
        });
    });

    describe('Holiday Checking and Caching Logic', () => {
        let holidayChecker;
        let mockHolidayCache;
        let mockHolidayAPI;

        beforeEach(() => {
            jest.clearAllMocks();
            
            mockHolidayCache = {
                get: jest.fn(),
                set: jest.fn(),
                clear: jest.fn(),
                warmup: jest.fn(),
                getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, hitRate: 0 })
            };
            
            mockHolidayAPI = {
                getHolidays: jest.fn(),
                isAPIAvailable: jest.fn(),
                getSupportedCountries: jest.fn()
            };
            
            holidayChecker = new HolidayChecker();
            holidayChecker.holidayCache = mockHolidayCache;
            holidayChecker.holidayAPI = mockHolidayAPI;
        });

        describe('Holiday Date Validation', () => {
            test('should correctly identify public holidays', async () => {
                const holidayData = [
                    { date: '2024-01-01', name: 'New Year\'s Day', type: 'public' },
                    { date: '2024-07-04', name: 'Independence Day', type: 'public' },
                    { date: '2024-12-25', name: 'Christmas Day', type: 'public' }
                ];
                
                mockHolidayCache.get.mockReturnValue({ data: holidayData });
                
                // Test known holidays
                const newYear = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                const independence = await holidayChecker.isPublicHoliday(new Date('2024-07-04'), 'US');
                const christmas = await holidayChecker.isPublicHoliday(new Date('2024-12-25'), 'US');
                
                expect(newYear).toBe(true);
                expect(independence).toBe(true);
                expect(christmas).toBe(true);
                
                // Test non-holiday
                const regularDay = await holidayChecker.isPublicHoliday(new Date('2024-06-15'), 'US');
                expect(regularDay).toBe(false);
            });

            test('should handle different holiday types correctly', async () => {
                const holidayData = [
                    { date: '2024-01-01', name: 'New Year\'s Day', type: 'public' },
                    { date: '2024-01-15', name: 'Bank Holiday', type: 'bank' },
                    { date: '2024-02-14', name: 'Valentine\'s Day', type: 'observance' }
                ];
                
                mockHolidayCache.get.mockReturnValue({ data: holidayData });
                
                // Should identify public holidays
                const publicHoliday = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                expect(publicHoliday).toBe(true);
                
                // Should handle bank holidays based on configuration
                const bankHoliday = await holidayChecker.isPublicHoliday(new Date('2024-01-15'), 'US');
                expect(bankHoliday).toBe(true); // Default behavior includes bank holidays
                
                // Should handle observances based on configuration
                const observance = await holidayChecker.isPublicHoliday(new Date('2024-02-14'), 'US');
                expect(observance).toBe(true); // Default behavior includes observances
            });

            test('should validate input parameters correctly', async () => {
                // Test invalid date inputs
                await expect(holidayChecker.isPublicHoliday()).rejects.toThrow('Date and country code are required');
                await expect(holidayChecker.isPublicHoliday(null, 'US')).rejects.toThrow('Date and country code are required');
                await expect(holidayChecker.isPublicHoliday('invalid', 'US')).rejects.toThrow('Invalid date provided');
                
                // Test invalid country code inputs
                await expect(holidayChecker.isPublicHoliday(new Date(), null)).rejects.toThrow('Date and country code are required');
                await expect(holidayChecker.isPublicHoliday(new Date(), '')).rejects.toThrow('Date and country code are required');
            });
        });

        describe('Caching Behavior', () => {
            test('should use cached data when available', async () => {
                const cachedData = {
                    data: [{ date: '2024-01-01', name: 'New Year\'s Day', type: 'public' }]
                };
                mockHolidayCache.get.mockReturnValue(cachedData);
                
                const result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                
                expect(result).toBe(true);
                expect(mockHolidayCache.get).toHaveBeenCalledWith('US', 2024);
                expect(mockHolidayAPI.getHolidays).not.toHaveBeenCalled();
            });

            test('should fetch from API when cache misses', async () => {
                const apiData = [{ date: '2024-01-01', name: 'New Year\'s Day', type: 'public' }];
                
                mockHolidayCache.get.mockReturnValue(null); // Cache miss
                mockHolidayAPI.getHolidays.mockResolvedValue(apiData);
                mockHolidayCache.set.mockReturnValue(true);
                
                const result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                
                expect(result).toBe(true);
                expect(mockHolidayAPI.getHolidays).toHaveBeenCalledWith('US', 2024);
                expect(mockHolidayCache.set).toHaveBeenCalledWith('US', 2024, apiData);
            });

            test('should handle cache errors gracefully', async () => {
                mockHolidayCache.get.mockImplementation(() => {
                    throw new Error('Cache error');
                });
                mockHolidayAPI.getHolidays.mockResolvedValue([]);
                
                const result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                
                // Should continue processing despite cache error
                expect(result).toBe(false);
                expect(mockHolidayAPI.getHolidays).toHaveBeenCalled();
            });
        });

        describe('Weekend Detection', () => {
            test('should correctly identify weekend days', () => {
                const testCases = [
                    { date: new Date('2024-01-06'), expected: true },  // Saturday
                    { date: new Date('2024-01-07'), expected: true },  // Sunday
                    { date: new Date('2024-01-08'), expected: false }, // Monday
                    { date: new Date('2024-01-09'), expected: false }, // Tuesday
                    { date: new Date('2024-01-10'), expected: false }, // Wednesday
                    { date: new Date('2024-01-11'), expected: false }, // Thursday
                    { date: new Date('2024-01-12'), expected: false }  // Friday
                ];
                
                testCases.forEach(({ date, expected }) => {
                    expect(holidayChecker.isWeekend(date)).toBe(expected);
                });
            });

            test('should handle custom weekend configurations', () => {
                const customChecker = new HolidayChecker({ weekendDays: [4, 5] }); // Thursday, Friday
                
                expect(customChecker.isWeekend(new Date('2024-01-11'))).toBe(true);  // Thursday
                expect(customChecker.isWeekend(new Date('2024-01-12'))).toBe(true);  // Friday
                expect(customChecker.isWeekend(new Date('2024-01-13'))).toBe(false); // Saturday
                expect(customChecker.isWeekend(new Date('2024-01-14'))).toBe(false); // Sunday
            });
        });

        describe('Business Day Calculation', () => {
            test('should identify business days correctly', async () => {
                mockHolidayCache.get.mockReturnValue({ data: [] }); // No holidays
                
                const monday = new Date('2024-01-08');    // Monday
                const saturday = new Date('2024-01-06');  // Saturday
                
                const mondayResult = await holidayChecker.isBusinessDay(monday, 'US', true, true);
                const saturdayResult = await holidayChecker.isBusinessDay(saturday, 'US', true, true);
                
                expect(mondayResult).toBe(true);
                expect(saturdayResult).toBe(false);
            });

            test('should find next business day correctly', async () => {
                mockHolidayCache.get.mockReturnValue({ data: [] }); // No holidays
                
                const friday = new Date('2024-01-05'); // Friday
                const nextBusinessDay = await holidayChecker.getNextBusinessDay(friday, 'US', true, false);
                
                // Should skip weekend and return Monday
                expect(nextBusinessDay.getDay()).toBe(1); // Monday
                expect(nextBusinessDay.getDate()).toBe(8); // January 8th
            });

            test('should handle consecutive holidays and weekends', async () => {
                const extendedHolidays = [
                    { date: '2024-01-01', name: 'New Year\'s Day', type: 'public' },
                    { date: '2024-01-02', name: 'New Year Holiday', type: 'public' }
                ];
                mockHolidayCache.get.mockReturnValue({ data: extendedHolidays });
                
                const newYearsEve = new Date('2023-12-31'); // Sunday
                const nextBusinessDay = await holidayChecker.getNextBusinessDay(newYearsEve, 'US', true, true);
                
                // Should skip New Year's Day (Jan 1) and New Year Holiday (Jan 2)
                expect(nextBusinessDay.getDate()).toBe(3); // January 3rd
            });
        });

        describe('Error Handling and Fallback Behavior', () => {
            test('should handle API failures gracefully', async () => {
                mockHolidayCache.get.mockReturnValue(null);
                mockHolidayAPI.getHolidays.mockRejectedValue(new Error('API error'));
                
                const result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                
                // Should use fallback behavior (default: ignore)
                expect(result).toBe(false);
                expect(holidayChecker.stats.errors).toBeGreaterThan(0);
            });

            test('should respect fallback behavior configuration', async () => {
                const assumeHolidayChecker = new HolidayChecker({ fallbackBehavior: 'assume_holiday' });
                assumeHolidayChecker.holidayCache = mockHolidayCache;
                assumeHolidayChecker.holidayAPI = mockHolidayAPI;
                
                mockHolidayCache.get.mockReturnValue(null);
                mockHolidayAPI.getHolidays.mockRejectedValue(new Error('API error'));
                
                const result = await assumeHolidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                
                // Should assume holiday when API fails
                expect(result).toBe(true);
            });

            test('should handle disabled holiday checking', async () => {
                const disabledChecker = new HolidayChecker({ enabled: false });
                
                const result = await disabledChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
                expect(result).toBe(false);
                
                const businessDay = await disabledChecker.isBusinessDay(new Date('2024-01-01'), 'US', false, true);
                expect(businessDay).toBe(true); // Only weekend checking should apply
            });
        });
    });

    describe('Time Window Processing and Date Adjustments', () => {
        let timeWindowValidator;
        let timeSlotSelector;
        let dateAdjuster;

        beforeEach(() => {
            timeWindowValidator = new TimeWindowValidator();
            timeSlotSelector = new TimeSlotSelector();
            dateAdjuster = new DateAdjuster();
        });

        describe('Time Window Validation', () => {
            test('should validate correct time window configurations', () => {
                const validTimeWindows = [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true },
                    { startHour: 10, endHour: 12, enabled: false }
                ];
                
                const result = timeWindowValidator.validateTimeWindows(validTimeWindows);
                
                expect(result.isValid).toBe(true);
                expect(result.errors).toHaveLength(0);
                expect(result.warnings).toBeDefined();
            });

            test('should detect invalid time window configurations', () => {
                const invalidTimeWindows = [
                    { startHour: 10, endHour: 9, enabled: true },   // Invalid: start > end
                    { startHour: -1, endHour: 10, enabled: true },  // Invalid: negative hour
                    { startHour: 9, endHour: 25, enabled: true },   // Invalid: hour > 23
                    { startHour: 9, enabled: true }                 // Invalid: missing endHour
                ];
                
                const result = timeWindowValidator.validateTimeWindows(invalidTimeWindows);
                
                expect(result.isValid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors).toContain('Time window at index 0: startHour must be less than endHour');
                expect(result.errors).toContain('Time window at index 1: startHour must be between 0 and 23');
                expect(result.errors).toContain('Time window at index 2: endHour must be between 0 and 23');
                expect(result.errors).toContain('Time window at index 3: endHour must be a number');
            });

            test('should require at least one enabled time window', () => {
                const noEnabledWindows = [
                    { startHour: 9, endHour: 10, enabled: false },
                    { startHour: 14, endHour: 16, enabled: false }
                ];
                
                const result = timeWindowValidator.validateTimeWindows(noEnabledWindows);
                
                expect(result.isValid).toBe(false);
                expect(result.errors).toContain('At least one time window must be selected');
            });

            test('should detect overlapping time windows', () => {
                const overlappingWindows = [
                    { startHour: 9, endHour: 11, enabled: true },
                    { startHour: 10, endHour: 12, enabled: true }
                ];
                
                const result = timeWindowValidator.validateTimeWindows(overlappingWindows);
                
                expect(result.isValid).toBe(true); // Overlaps are allowed but warned
                expect(result.warnings).toContain('Time windows 9:00-11:00 and 10:00-12:00 overlap');
            });
        });

        describe('Time Slot Selection', () => {
            test('should select optimal time slot from available windows', () => {
                const timeWindows = [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ];
                
                const targetDate = new Date('2024-01-15T08:00:00Z'); // Monday 8 AM
                const result = timeSlotSelector.selectOptimalTimeSlot(targetDate, timeWindows);
                
                expect(result.success).toBe(true);
                expect(result.selectedSlot).toBeDefined();
                expect(result.selectedSlot.hour).toBe(9); // Should select first available slot
                expect(result.alternativeSlots).toBeDefined();
                expect(result.alternativeSlots.length).toBeGreaterThan(0);
            });

            test('should respect preferred time slot when available', () => {
                const timeWindows = [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ];
                
                const targetDate = new Date('2024-01-15T08:00:00Z');
                const preferences = { preferredHour: 14 };
                const result = timeSlotSelector.selectOptimalTimeSlot(targetDate, timeWindows, preferences);
                
                expect(result.success).toBe(true);
                expect(result.selectedSlot.hour).toBe(14);
                expect(result.selectedSlot.reason).toContain('preferred');
            });

            test('should fall back to alternative when preferred slot unavailable', () => {
                const timeWindows = [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ];
                
                const targetDate = new Date('2024-01-15T08:00:00Z');
                const preferences = { 
                    preferredHour: 12, // Not in any enabled window
                    excludedHours: [9] // Exclude first option
                };
                const result = timeSlotSelector.selectOptimalTimeSlot(targetDate, timeWindows, preferences);
                
                expect(result.success).toBe(true);
                expect(result.selectedSlot.hour).toBe(14); // Should select next available
                expect(result.selectedSlot.reason).toContain('earliest');
            });

            test('should handle no available slots gracefully', () => {
                const timeWindows = [
                    { startHour: 9, endHour: 10, enabled: false },
                    { startHour: 14, endHour: 16, enabled: false }
                ];
                
                const targetDate = new Date('2024-01-15T08:00:00Z');
                const result = timeSlotSelector.selectOptimalTimeSlot(targetDate, timeWindows);
                
                expect(result.success).toBe(false);
                expect(result.error).toBe('No enabled time windows available');
                expect(result.selectedSlot).toBeNull();
            });
        });

        describe('Date Adjustment Logic', () => {
            test('should adjust dates for weekend exclusions', async () => {
                const saturday = new Date('2024-01-06T10:00:00Z'); // Saturday
                const result = await dateAdjuster.adjustDateForExclusions(saturday, { skipWeekends: true });
                
                expect(result.success).toBe(true);
                expect(result.adjustedDate.getDay()).toBe(1); // Monday
                expect(result.daysAdjusted).toBe(2);
                expect(result.reason).toContain('forward to avoid exclusions');
            });

            test('should not adjust dates when weekend exclusion disabled', async () => {
                const saturday = new Date('2024-01-06T10:00:00Z'); // Saturday
                const result = await dateAdjuster.adjustDateForExclusions(saturday, { skipWeekends: false });
                
                expect(result.success).toBe(true);
                expect(result.adjustedDate).toEqual(saturday);
                expect(result.daysAdjusted).toBe(0);
                expect(result.reason).toBe('No adjustment needed');
            });

            test('should adjust dates for holiday exclusions', async () => {
                const mockHolidayChecker = {
                    isPublicHoliday: jest.fn()
                        .mockResolvedValueOnce(true)  // Jan 1 is holiday
                        .mockResolvedValueOnce(false) // Jan 2 is not
                };
                
                const newYearsDay = new Date('2024-01-01T10:00:00Z');
                const result = await dateAdjuster.adjustDateForExclusions(newYearsDay, { 
                    skipHolidays: true, 
                    holidayChecker: mockHolidayChecker 
                });
                
                expect(result.success).toBe(true);
                expect(result.adjustedDate.getDate()).toBe(2); // January 2nd
                expect(result.daysAdjusted).toBe(1);
                expect(result.reason).toContain('forward to avoid exclusions');
            });

            test('should handle consecutive exclusions correctly', async () => {
                const mockHolidayChecker = {
                    isPublicHoliday: jest.fn()
                        .mockResolvedValueOnce(true)  // Jan 1 is holiday
                        .mockResolvedValueOnce(true)  // Jan 2 is holiday
                        .mockResolvedValueOnce(false) // Jan 3 is not
                };
                
                const newYearsDay = new Date('2024-01-01T10:00:00Z');
                const result = await dateAdjuster.adjustDateForExclusions(newYearsDay, { 
                    skipHolidays: true, 
                    holidayChecker: mockHolidayChecker 
                });
                
                expect(result.success).toBe(true);
                expect(result.adjustedDate.getDate()).toBe(3); // January 3rd
                expect(result.daysAdjusted).toBe(2);
            });

            test('should maintain same time of day when adjusting dates', async () => {
                const saturday = new Date('2024-01-06T14:30:00Z'); // Saturday 2:30 PM
                const result = await dateAdjuster.adjustDateForExclusions(saturday, { skipWeekends: true });
                
                expect(result.success).toBe(true);
                expect(result.adjustedDate.getUTCHours()).toBe(saturday.getUTCHours());
                expect(result.adjustedDate.getUTCMinutes()).toBe(saturday.getUTCMinutes());
                expect(result.adjustedDate.getUTCSeconds()).toBe(saturday.getUTCSeconds());
            });

            test('should respect maximum adjustment days limit', async () => {
                const mockHolidayChecker = {
                    isPublicHoliday: jest.fn().mockResolvedValue(true) // All days are holidays
                };
                
                const startDate = new Date('2024-01-01T10:00:00Z');
                const result = await dateAdjuster.adjustDateForExclusions(startDate, { 
                    skipHolidays: true, 
                    holidayChecker: mockHolidayChecker,
                    maxDaysToCheck: 3 
                });
                
                expect(result.success).toBe(false);
                expect(result.error).toContain('No available date found within 3 days');
            });
        });

        describe('Combined Date and Time Processing', () => {
            test('should process complete date and time adjustment workflow', async () => {
                const mockHolidayChecker = {
                    isPublicHoliday: jest.fn().mockResolvedValue(false)
                };
                
                const timeWindows = [
                    { startHour: 9, endHour: 10, enabled: true },
                    { startHour: 14, endHour: 16, enabled: true }
                ];
                
                const saturday = new Date('2024-01-06T08:00:00Z'); // Saturday 8 AM
                
                // First adjust for weekend
                const dateResult = await dateAdjuster.adjustDateForExclusions(saturday, { skipWeekends: true });
                expect(dateResult.success).toBe(true);
                expect(dateResult.adjustedDate.getDay()).toBe(1); // Monday
                
                // Then select time slot
                const timeResult = timeSlotSelector.selectOptimalTimeSlot(dateResult.adjustedDate, timeWindows);
                expect(timeResult.success).toBe(true);
                expect(timeResult.selectedSlot.hour).toBe(9);
                
                // Final datetime should be Monday 9 AM
                expect(timeResult.selectedSlot.datetime.getDay()).toBe(1); // Monday
                expect(timeResult.selectedSlot.datetime.getUTCHours()).toBe(9);
            });

            test('should handle complex scenarios with multiple adjustments', async () => {
                const mockHolidayChecker = {
                    isPublicHoliday: jest.fn()
                        .mockResolvedValueOnce(false) // Monday not holiday
                        .mockResolvedValueOnce(true)  // But if we check Tuesday, it is
                        .mockResolvedValueOnce(false) // Wednesday is not
                };
                
                const timeWindows = [
                    { startHour: 15, endHour: 16, enabled: true } // Only 3-4 PM available
                ];
                
                const friday = new Date('2024-01-05T16:30:00Z'); // Friday 4:30 PM (after window)
                
                // Should adjust to Monday (skip weekend) and then to 3 PM (within window)
                const dateResult = await dateAdjuster.adjustDateForExclusions(friday, { skipWeekends: true });
                const timeResult = timeSlotSelector.selectOptimalTimeSlot(dateResult.adjustedDate, timeWindows);
                
                expect(dateResult.success).toBe(true);
                expect(timeResult.success).toBe(true);
                expect(timeResult.selectedSlot.hour).toBe(15);
            });
        });
    });
});