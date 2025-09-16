/**
 * Tests for Holiday Checker
 */

const HolidayChecker = require('../src/holiday-checker');
const HolidayAPI = require('../src/holiday-api');
const HolidayCache = require('../src/holiday-cache');

// Mock the dependencies
jest.mock('../src/holiday-api');
jest.mock('../src/holiday-cache');

describe('HolidayChecker', () => {
    let holidayChecker;
    let mockHolidayAPI;
    let mockHolidayCache;
    let mockHolidayData;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create mock instances
        mockHolidayAPI = {
            getHolidays: jest.fn(),
            isAPIAvailable: jest.fn(),
            getSupportedCountries: jest.fn()
        };

        mockHolidayCache = {
            get: jest.fn(),
            set: jest.fn(),
            warmup: jest.fn(),
            clear: jest.fn(),
            getStats: jest.fn().mockReturnValue({
                hits: 0,
                misses: 0,
                hitRate: 0
            })
        };

        // Mock constructors
        HolidayAPI.mockImplementation(() => mockHolidayAPI);
        HolidayCache.mockImplementation(() => mockHolidayCache);

        // Create holiday checker instance
        holidayChecker = new HolidayChecker();

        // Mock holiday data
        mockHolidayData = [
            {
                date: '2024-01-01',
                name: 'New Year\'s Day',
                countryCode: 'US',
                year: 2024,
                type: 'public'
            },
            {
                date: '2024-07-04',
                name: 'Independence Day',
                countryCode: 'US',
                year: 2024,
                type: 'public'
            },
            {
                date: '2024-12-25',
                name: 'Christmas Day',
                countryCode: 'US',
                year: 2024,
                type: 'public'
            }
        ];
    });

    describe('constructor', () => {
        it('should create instance with default configuration', () => {
            expect(holidayChecker.enabled).toBe(true);
            expect(holidayChecker.fallbackBehavior).toBe('ignore');
            expect(holidayChecker.maxLookAheadDays).toBe(30);
            expect(holidayChecker.weekendDays).toEqual([0, 6]); // Sunday and Saturday
        });

        it('should accept custom configuration', () => {
            const customOptions = {
                enabled: false,
                fallbackBehavior: 'assume_holiday',
                maxLookAheadDays: 14,
                weekendDays: [5, 6] // Friday and Saturday
            };

            const checker = new HolidayChecker(customOptions);

            expect(checker.enabled).toBe(false);
            expect(checker.fallbackBehavior).toBe('assume_holiday');
            expect(checker.maxLookAheadDays).toBe(14);
            expect(checker.weekendDays).toEqual([5, 6]);
        });
    });

    describe('isPublicHoliday', () => {
        it('should return false when disabled', async () => {
            const disabledChecker = new HolidayChecker({ enabled: false });
            const result = await disabledChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
            expect(result).toBe(false);
        });

        it('should validate input parameters', async () => {
            await expect(holidayChecker.isPublicHoliday()).rejects.toThrow('Date and country code are required');
            await expect(holidayChecker.isPublicHoliday(new Date(), null)).rejects.toThrow('Date and country code are required');
            await expect(holidayChecker.isPublicHoliday('invalid', 'US')).rejects.toThrow('Invalid date provided');
        });

        it('should return true for known holidays', async () => {
            // Mock cache miss, then API success
            mockHolidayCache.get.mockReturnValue(null);
            mockHolidayAPI.getHolidays.mockResolvedValue(mockHolidayData);
            mockHolidayCache.set.mockReturnValue(true);

            const result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');

            expect(result).toBe(true);
            expect(mockHolidayAPI.getHolidays).toHaveBeenCalledWith('US', 2024);
            expect(mockHolidayCache.set).toHaveBeenCalledWith('US', 2024, mockHolidayData);
        });

        it('should return false for non-holidays', async () => {
            mockHolidayCache.get.mockReturnValue(null);
            mockHolidayAPI.getHolidays.mockResolvedValue(mockHolidayData);

            const result = await holidayChecker.isPublicHoliday(new Date('2024-06-15'), 'US');

            expect(result).toBe(false);
        });

        it('should use cached data when available', async () => {
            const cachedData = { data: mockHolidayData };
            mockHolidayCache.get.mockReturnValue(cachedData);

            const result = await holidayChecker.isPublicHoliday(new Date('2024-07-04'), 'US');

            expect(result).toBe(true);
            expect(mockHolidayAPI.getHolidays).not.toHaveBeenCalled();
            expect(holidayChecker.stats.cacheHits).toBe(1);
        });

        it('should handle missing holiday data based on fallback behavior', async () => {
            mockHolidayCache.get.mockReturnValue(null);
            mockHolidayAPI.getHolidays.mockResolvedValue(null);

            // Test 'ignore' behavior (default)
            let result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
            expect(result).toBe(false);

            // Test 'assume_holiday' behavior
            const assumeHolidayChecker = new HolidayChecker({ fallbackBehavior: 'assume_holiday' });
            assumeHolidayChecker.holidayAPI = mockHolidayAPI;
            assumeHolidayChecker.holidayCache = mockHolidayCache;

            result = await assumeHolidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');
            expect(result).toBe(true);
        });

        it('should handle API errors gracefully', async () => {
            mockHolidayCache.get.mockReturnValue(null);
            mockHolidayAPI.getHolidays.mockRejectedValue(new Error('API error'));

            const result = await holidayChecker.isPublicHoliday(new Date('2024-01-01'), 'US');

            expect(result).toBe(false); // Default fallback behavior
            expect(holidayChecker.stats.errors).toBe(1);
        });
    });

    describe('isWeekend', () => {
        it('should identify weekend days correctly', () => {
            // Sunday (0)
            expect(holidayChecker.isWeekend(new Date('2024-01-07'))).toBe(true);
            // Saturday (6)
            expect(holidayChecker.isWeekend(new Date('2024-01-06'))).toBe(true);
            // Monday (1)
            expect(holidayChecker.isWeekend(new Date('2024-01-08'))).toBe(false);
            // Friday (5)
            expect(holidayChecker.isWeekend(new Date('2024-01-05'))).toBe(false);
        });

        it('should handle custom weekend days', () => {
            const customChecker = new HolidayChecker({ weekendDays: [4, 5] }); // Thursday, Friday

            expect(customChecker.isWeekend(new Date('2024-01-04'))).toBe(true); // Thursday
            expect(customChecker.isWeekend(new Date('2024-01-05'))).toBe(true); // Friday
            expect(customChecker.isWeekend(new Date('2024-01-06'))).toBe(false); // Saturday
            expect(customChecker.isWeekend(new Date('2024-01-07'))).toBe(false); // Sunday
        });

        it('should handle invalid dates', () => {
            expect(holidayChecker.isWeekend(new Date('invalid'))).toBe(false);
            expect(holidayChecker.isWeekend('not a date')).toBe(false);
            expect(holidayChecker.isWeekend(null)).toBe(false);
        });
    });

    describe('isBusinessDay', () => {
        beforeEach(() => {
            mockHolidayCache.get.mockReturnValue({ data: mockHolidayData });
        });

        it('should return false for weekends when skipWeekends is true', async () => {
            const result = await holidayChecker.isBusinessDay(new Date('2024-01-06'), 'US', true, false); // Saturday
            expect(result).toBe(false);
        });

        it('should return true for weekends when skipWeekends is false', async () => {
            const result = await holidayChecker.isBusinessDay(new Date('2024-01-06'), 'US', false, false); // Saturday
            expect(result).toBe(true);
        });

        it('should return false for holidays when skipHolidays is true', async () => {
            const result = await holidayChecker.isBusinessDay(new Date('2024-01-01'), 'US', false, true); // New Year
            expect(result).toBe(false);
        });

        it('should return true for holidays when skipHolidays is false', async () => {
            const result = await holidayChecker.isBusinessDay(new Date('2024-01-01'), 'US', false, false); // New Year
            expect(result).toBe(true);
        });

        it('should return true for regular business days', async () => {
            const result = await holidayChecker.isBusinessDay(new Date('2024-01-02'), 'US', true, true); // Tuesday, not holiday
            expect(result).toBe(true);
        });

        it('should handle errors gracefully', async () => {
            mockHolidayCache.get.mockReturnValue(null);
            mockHolidayAPI.getHolidays.mockRejectedValue(new Error('API error'));

            // Should default to checking only weekend when holiday check fails
            const weekdayResult = await holidayChecker.isBusinessDay(new Date('2024-01-02'), 'US', true, true); // Tuesday
            const weekendResult = await holidayChecker.isBusinessDay(new Date('2024-01-06'), 'US', true, true); // Saturday

            expect(weekdayResult).toBe(true);
            expect(weekendResult).toBe(false);
        });
    });

    describe('getNextBusinessDay', () => {
        beforeEach(() => {
            mockHolidayCache.get.mockReturnValue({ data: mockHolidayData });
        });

        it('should find next business day after weekend', async () => {
            const friday = new Date('2024-01-05'); // Friday
            const result = await holidayChecker.getNextBusinessDay(friday, 'US', true, true);

            // Should skip Saturday (6th) and Sunday (7th), return Monday (8th)
            expect(result.getDate()).toBe(8);
            expect(result.getDay()).toBe(1); // Monday
        });

        it('should find next business day after holiday', async () => {
            const newYearsEve = new Date('2023-12-31'); // Sunday before New Year
            const result = await holidayChecker.getNextBusinessDay(newYearsEve, 'US', true, true);

            // Should skip New Year's Day (Jan 1st), return Jan 2nd
            expect(result.getDate()).toBe(2);
            expect(result.getMonth()).toBe(0); // January
            expect(result.getFullYear()).toBe(2024);
        });

        it('should handle consecutive holidays and weekends', async () => {
            // Mock Christmas falling on Monday, followed by weekend
            const extendedHolidays = [
                ...mockHolidayData,
                { date: '2024-12-23', name: 'Christmas Eve', countryCode: 'US', year: 2024, type: 'public' },
                { date: '2024-12-24', name: 'Christmas Eve', countryCode: 'US', year: 2024, type: 'public' },
                { date: '2024-12-26', name: 'Boxing Day', countryCode: 'US', year: 2024, type: 'public' }
            ];

            mockHolidayCache.get.mockReturnValue({ data: extendedHolidays });

            const beforeChristmas = new Date('2024-12-22'); // Sunday
            const result = await holidayChecker.getNextBusinessDay(beforeChristmas, 'US', true, true);

            // Should find first non-holiday, non-weekend day
            expect(result.getDate()).toBe(27); // December 27th (Friday)
        });

        it('should return fallback date when no business day found within limit', async () => {
            // Mock all days as holidays
            const manyHolidays = [];
            for (let i = 1; i <= 35; i++) {
                manyHolidays.push({
                    date: `2024-01-${i.toString().padStart(2, '0')}`,
                    name: `Holiday ${i}`,
                    countryCode: 'US',
                    year: 2024,
                    type: 'public'
                });
            }

            mockHolidayCache.get.mockReturnValue({ data: manyHolidays });

            const customChecker = new HolidayChecker({ maxLookAheadDays: 5 });
            customChecker.holidayAPI = mockHolidayAPI;
            customChecker.holidayCache = mockHolidayCache;

            const startDate = new Date('2024-01-01');
            const result = await customChecker.getNextBusinessDay(startDate, 'US', true, true);

            // Should return date 5 days ahead (maxLookAheadDays)
            expect(result.getDate()).toBe(6);
        });

        it('should handle invalid start date', async () => {
            await expect(holidayChecker.getNextBusinessDay('invalid', 'US')).rejects.toThrow('Invalid start date provided');
        });

        it('should handle errors gracefully', async () => {
            mockHolidayCache.get.mockReturnValue(null);
            mockHolidayAPI.getHolidays.mockRejectedValue(new Error('API error'));

            const startDate = new Date('2024-01-01');
            const result = await holidayChecker.getNextBusinessDay(startDate, 'US', true, true);

            // Should return next day as fallback
            expect(result.getDate()).toBe(2);
            expect(holidayChecker.stats.errors).toBeGreaterThan(0);
        });
    });

    describe('getHolidays', () => {
        it('should get holidays for single year', async () => {
            mockHolidayCache.get.mockReturnValue({ data: mockHolidayData });

            const result = await holidayChecker.getHolidays('US', 2024);

            expect(result).toEqual(mockHolidayData);
            expect(mockHolidayCache.get).toHaveBeenCalledWith('US', 2024);
        });

        it('should get holidays for year range', async () => {
            const holidays2024 = mockHolidayData;
            const holidays2025 = [
                { date: '2025-01-01', name: 'New Year\'s Day', countryCode: 'US', year: 2025, type: 'public' }
            ];

            mockHolidayCache.get
                .mockReturnValueOnce({ data: holidays2024 })
                .mockReturnValueOnce({ data: holidays2025 });

            const result = await holidayChecker.getHolidays('US', 2024, 2025);

            expect(result).toHaveLength(4);
            expect(result[0].date).toBe('2024-01-01');
            expect(result[3].date).toBe('2025-01-01');
        });

        it('should handle errors for individual years gracefully', async () => {
            mockHolidayCache.get
                .mockReturnValueOnce({ data: mockHolidayData }) // 2024 succeeds
                .mockReturnValueOnce(null); // 2025 cache miss

            mockHolidayAPI.getHolidays.mockRejectedValue(new Error('API error'));

            const result = await holidayChecker.getHolidays('US', 2024, 2025);

            // Should return only 2024 holidays
            expect(result).toEqual(mockHolidayData);
        });
    });

    describe('warmupCache', () => {
        it('should delegate to cache warmup', async () => {
            const warmupResults = { success: 5, failed: 0, skipped: 2 };
            mockHolidayCache.warmup.mockResolvedValue(warmupResults);

            const result = await holidayChecker.warmupCache(['US', 'CA'], [2024]);

            expect(result).toEqual(warmupResults);
            expect(mockHolidayCache.warmup).toHaveBeenCalledWith(
                expect.any(Function),
                ['US', 'CA'],
                [2024]
            );
        });

        it('should return disabled message when disabled', async () => {
            const disabledChecker = new HolidayChecker({ enabled: false });
            const result = await disabledChecker.warmupCache();

            expect(result.errors).toContain('Holiday checking is disabled');
        });
    });

    describe('utility methods', () => {
        it('should check API availability', async () => {
            mockHolidayAPI.isAPIAvailable.mockResolvedValue(true);

            const result = await holidayChecker.isAPIAvailable();

            expect(result).toBe(true);
            expect(mockHolidayAPI.isAPIAvailable).toHaveBeenCalled();
        });

        it('should get supported countries', async () => {
            const countries = [{ countryCode: 'US', name: 'United States' }];
            mockHolidayAPI.getSupportedCountries.mockResolvedValue(countries);

            const result = await holidayChecker.getSupportedCountries();

            expect(result).toEqual(countries);
        });

        it('should get statistics', () => {
            holidayChecker.stats.holidaysFound = 5;
            holidayChecker.stats.businessDaysFound = 10;

            const stats = holidayChecker.getStats();

            expect(stats.holidaysFound).toBe(5);
            expect(stats.businessDaysFound).toBe(10);
            expect(stats.cache).toBeDefined();
            expect(stats.enabled).toBe(true);
        });

        it('should clear cache', () => {
            mockHolidayCache.clear.mockReturnValue(true);

            const result = holidayChecker.clearCache();

            expect(result).toBe(true);
            expect(mockHolidayCache.clear).toHaveBeenCalled();
        });
    });

    describe('date formatting', () => {
        it('should format dates correctly', () => {
            const date = new Date('2024-01-01T12:00:00Z');
            const formatted = holidayChecker._formatDate(date);

            expect(formatted).toBe('2024-01-01');
        });
    });

    describe('year range generation', () => {
        it('should generate year ranges correctly', () => {
            const range = holidayChecker._getYearRange(2022, 2024);

            expect(range).toEqual([2022, 2023, 2024]);
        });
    });
});