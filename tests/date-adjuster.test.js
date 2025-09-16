/**
 * Tests for Date Adjuster
 */

const DateAdjuster = require('../src/timewindow/date-adjuster');

describe('DateAdjuster', () => {
    let adjuster;
    let mockHolidayChecker;

    beforeEach(() => {
        adjuster = new DateAdjuster();
        mockHolidayChecker = {
            isPublicHoliday: jest.fn()
        };
    });

    describe('adjustDateForExclusions', () => {
        test('should return original date when no adjustments needed', async () => {
            const monday = new Date('2024-01-15T10:00:00Z'); // Monday
            const result = await adjuster.adjustDateForExclusions(monday, {
                skipWeekends: false,
                skipHolidays: false
            });

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(0);
            expect(result.adjustedDate.getTime()).toBe(monday.getTime());
            expect(result.reason).toBe('No adjustment needed');
        });

        test('should skip weekend when skipWeekends is true', async () => {
            const saturday = new Date('2024-01-13T10:00:00Z'); // Saturday
            const result = await adjuster.adjustDateForExclusions(saturday, {
                skipWeekends: true,
                skipHolidays: false
            });

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(2); // Skip Sat, Sun -> Monday
            expect(result.adjustedDate.getDay()).toBe(1); // Monday
            expect(result.adjustedDate.getUTCHours()).toBe(10); // Maintain time
        });

        test('should skip holidays when skipHolidays is true', async () => {
            const testDate = new Date('2024-01-15T10:00:00Z'); // Monday
            mockHolidayChecker.isPublicHoliday
                .mockResolvedValueOnce(true)  // Monday is holiday
                .mockResolvedValueOnce(false); // Tuesday is not

            const result = await adjuster.adjustDateForExclusions(testDate, {
                skipWeekends: false,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(1);
            expect(result.adjustedDate.getDate()).toBe(16); // Tuesday
        });

        test('should handle multiple consecutive exclusions', async () => {
            const friday = new Date('2024-01-12T10:00:00Z'); // Friday
            mockHolidayChecker.isPublicHoliday
                .mockResolvedValueOnce(true)  // Friday is holiday
                .mockResolvedValueOnce(false) // Monday is not
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(false);

            const result = await adjuster.adjustDateForExclusions(friday, {
                skipWeekends: true,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(3); // Skip Fri(holiday), Sat, Sun -> Monday
            expect(result.adjustedDate.getDay()).toBe(1); // Monday
        });

        test('should fail when max days exceeded', async () => {
            const saturday = new Date('2024-01-13T10:00:00Z');
            const result = await adjuster.adjustDateForExclusions(saturday, {
                skipWeekends: true,
                maxDaysToCheck: 1
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('No available date found within 1 days');
        });

        test('should throw error for invalid date', async () => {
            await expect(adjuster.adjustDateForExclusions('invalid-date')).rejects.toThrow('Target date must be a valid Date object');
        });

        test('should maintain time of day by default', async () => {
            const saturday = new Date('2024-01-13T14:30:45.123Z');
            const result = await adjuster.adjustDateForExclusions(saturday, {
                skipWeekends: true
            });

            expect(result.success).toBe(true);
            expect(result.adjustedDate.getUTCHours()).toBe(14);
            expect(result.adjustedDate.getUTCMinutes()).toBe(30);
            expect(result.adjustedDate.getUTCSeconds()).toBe(45);
            expect(result.adjustedDate.getUTCMilliseconds()).toBe(123);
        });
    });

    describe('isDateAvailable', () => {
        test('should return available for regular weekday', async () => {
            const monday = new Date('2024-01-15T10:00:00Z');
            const result = await adjuster.isDateAvailable(monday, {
                skipWeekends: false,
                skipHolidays: false
            });

            expect(result.isAvailable).toBe(true);
            expect(result.exclusionReasons).toHaveLength(0);
        });

        test('should exclude weekends when skipWeekends is true', async () => {
            const saturday = new Date('2024-01-13T10:00:00Z');
            const result = await adjuster.isDateAvailable(saturday, {
                skipWeekends: true
            });

            expect(result.isAvailable).toBe(false);
            expect(result.exclusionReasons).toContain('Weekend (Saturday)');
        });

        test('should exclude holidays when skipHolidays is true', async () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            mockHolidayChecker.isPublicHoliday.mockResolvedValue(true);

            const result = await adjuster.isDateAvailable(testDate, {
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.isAvailable).toBe(false);
            expect(result.exclusionReasons).toContain('Public holiday');
        });

        test('should handle holiday checker errors gracefully', async () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            mockHolidayChecker.isPublicHoliday.mockRejectedValue(new Error('API Error'));

            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const result = await adjuster.isDateAvailable(testDate, {
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.isAvailable).toBe(true); // Should not exclude on error
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Holiday check failed')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('handleConsecutiveExclusions', () => {
        test('should find next available date after consecutive exclusions', async () => {
            const friday = new Date('2024-01-12T10:00:00Z'); // Friday
            mockHolidayChecker.isPublicHoliday
                .mockResolvedValueOnce(true)  // Friday is holiday
                .mockResolvedValueOnce(false); // Monday is not

            const result = await adjuster.handleConsecutiveExclusions(friday, {
                skipWeekends: true,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.success).toBe(true);
            expect(result.consecutiveExcludedDays).toBe(3);
            expect(result.nextAvailableDate.getDay()).toBe(1); // Monday
            expect(result.excludedDates).toHaveLength(3);
        });

        test('should fail when too many consecutive days are excluded', async () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            mockHolidayChecker.isPublicHoliday.mockResolvedValue(true); // Always holiday

            const result = await adjuster.handleConsecutiveExclusions(testDate, {
                skipWeekends: true,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            }, 3);

            expect(result.success).toBe(false);
            expect(result.error).toContain('More than 3 consecutive days are excluded');
        });
    });

    describe('maintainTimeOfDay', () => {
        test('should copy time from original to new date', () => {
            const originalDate = new Date('2024-01-15T14:30:45.123Z');
            const newDate = new Date('2024-01-17T00:00:00.000Z');

            const result = adjuster.maintainTimeOfDay(originalDate, newDate);

            expect(result.getUTCFullYear()).toBe(2024);
            expect(result.getUTCMonth()).toBe(0); // January
            expect(result.getUTCDate()).toBe(17);
            expect(result.getUTCHours()).toBe(14);
            expect(result.getUTCMinutes()).toBe(30);
            expect(result.getUTCSeconds()).toBe(45);
            expect(result.getUTCMilliseconds()).toBe(123);
        });
    });

    describe('findNextDayOfWeek', () => {
        test('should find next occurrence of target day', async () => {
            const monday = new Date('2024-01-15T10:00:00Z'); // Monday
            const result = await adjuster.findNextDayOfWeek(monday, 3); // Wednesday

            expect(result.success).toBe(true);
            expect(result.foundDate.getDay()).toBe(3); // Wednesday
            expect(result.daysFromStart).toBe(2);
            expect(result.dayName).toBe('Wednesday');
        });

        test('should return same day if it matches target', async () => {
            const wednesday = new Date('2024-01-17T10:00:00Z'); // Wednesday
            const result = await adjuster.findNextDayOfWeek(wednesday, 3); // Wednesday

            expect(result.success).toBe(true);
            expect(result.daysFromStart).toBe(0);
        });

        test('should throw error for invalid day of week', async () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            await expect(adjuster.findNextDayOfWeek(testDate, 7)).rejects.toThrow(
                'Target day of week must be between 0 (Sunday) and 6 (Saturday)'
            );
        });

        test('should respect exclusion rules', async () => {
            const monday = new Date('2024-01-15T10:00:00Z');
            mockHolidayChecker.isPublicHoliday
                .mockResolvedValueOnce(true)  // First Wednesday is holiday
                .mockResolvedValueOnce(false); // Next Wednesday is not

            const result = await adjuster.findNextDayOfWeek(monday, 3, {
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.success).toBe(true);
            expect(result.daysFromStart).toBe(9); // Skip to next Wednesday
        });
    });

    describe('calculateBusinessDays', () => {
        test('should calculate business days correctly', async () => {
            const startDate = new Date('2024-01-15T10:00:00Z'); // Monday
            const endDate = new Date('2024-01-19T10:00:00Z');   // Friday
            mockHolidayChecker.isPublicHoliday.mockResolvedValue(false);

            const result = await adjuster.calculateBusinessDays(startDate, endDate, {
                skipWeekends: true,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.businessDays).toBe(4); // Mon, Tue, Wed, Thu
            expect(result.totalDays).toBe(4);
            expect(result.businessDayPercentage).toBe(100);
        });

        test('should exclude weekends from business days', async () => {
            const startDate = new Date('2024-01-13T10:00:00Z'); // Saturday
            const endDate = new Date('2024-01-16T10:00:00Z');   // Tuesday
            mockHolidayChecker.isPublicHoliday.mockResolvedValue(false);

            const result = await adjuster.calculateBusinessDays(startDate, endDate, {
                skipWeekends: true,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.businessDays).toBe(1); // Only Monday
            expect(result.totalDays).toBe(3); // Sat, Sun, Mon
            expect(result.excludedDays).toHaveLength(2); // Sat, Sun
        });

        test('should return zero for same or past end date', async () => {
            const date = new Date('2024-01-15T10:00:00Z');
            const result = await adjuster.calculateBusinessDays(date, date);

            expect(result.businessDays).toBe(0);
            expect(result.totalDays).toBe(0);
        });
    });

    describe('utility methods', () => {
        test('isWeekend should identify weekends correctly', () => {
            expect(adjuster.isWeekend(new Date('2024-01-13T10:00:00Z'))).toBe(true);  // Saturday
            expect(adjuster.isWeekend(new Date('2024-01-14T10:00:00Z'))).toBe(true);  // Sunday
            expect(adjuster.isWeekend(new Date('2024-01-15T10:00:00Z'))).toBe(false); // Monday
        });

        test('getDayName should return correct day names', () => {
            expect(adjuster.getDayName(new Date('2024-01-14T10:00:00Z'))).toBe('Sunday');
            expect(adjuster.getDayName(new Date('2024-01-15T10:00:00Z'))).toBe('Monday');
            expect(adjuster.getDayName(new Date('2024-01-13T10:00:00Z'))).toBe('Saturday');
        });

        test('getNextBusinessDay should skip weekends', () => {
            const friday = new Date('2024-01-12T10:00:00Z');
            const nextBusinessDay = adjuster.getNextBusinessDay(friday);

            expect(nextBusinessDay.getDay()).toBe(1); // Monday
            expect(nextBusinessDay.getDate()).toBe(15);
        });
    });

    describe('validateAdjustmentParameters', () => {
        test('should validate correct parameters', () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            const result = adjuster.validateAdjustmentParameters(testDate, {
                maxDaysToCheck: 30
            }, {
                preferredDayOfWeek: 1
            });

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should fail for invalid date', () => {
            const result = adjuster.validateAdjustmentParameters('invalid');

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Target date must be a valid Date object');
        });

        test('should fail for invalid maxDaysToCheck', () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            const result = adjuster.validateAdjustmentParameters(testDate, {
                maxDaysToCheck: -1
            });

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('maxDaysToCheck must be a positive number');
        });

        test('should fail when skipHolidays is true but no holidayChecker', () => {
            const testDate = new Date('2024-01-15T10:00:00Z');
            const result = adjuster.validateAdjustmentParameters(testDate, {
                skipHolidays: true
            });

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('holidayChecker is required when skipHolidays is true');
        });
    });

    describe('createAdjustmentSummary', () => {
        test('should create summary of adjustments', () => {
            const adjustments = [
                {
                    excluded: true,
                    reasons: ['Weekend (Saturday)']
                },
                {
                    excluded: true,
                    reasons: ['Public holiday']
                },
                {
                    excluded: true,
                    reasons: ['Weekend (Sunday)']
                }
            ];

            const summary = adjuster.createAdjustmentSummary(adjustments);

            expect(summary.totalAdjustments).toBe(3);
            expect(summary.weekendExclusions).toBe(2);
            expect(summary.holidayExclusions).toBe(1);
            expect(summary.adjustmentsByReason['Weekend (Saturday)']).toBe(1);
            expect(summary.adjustmentsByReason['Public holiday']).toBe(1);
        });
    });
});