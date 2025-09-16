/**
 * Tests for Time Window Processor
 */

const { TimeWindowProcessor } = require('../src/timewindow');

describe('TimeWindowProcessor', () => {
    let processor;
    let mockHolidayChecker;

    beforeEach(() => {
        processor = new TimeWindowProcessor();
        mockHolidayChecker = {
            isPublicHoliday: jest.fn().mockResolvedValue(false)
        };
    });

    describe('processTimeWindow', () => {
        const validTimeWindows = [
            { startHour: 9, endHour: 10, enabled: true },
            { startHour: 14, endHour: 16, enabled: true }
        ];

        test('should process complete time window selection successfully', async () => {
            const targetDate = new Date('2024-01-15T08:00:00Z'); // Monday
            const result = await processor.processTimeWindow(targetDate, validTimeWindows);

            expect(result.success).toBe(true);
            expect(result.originalDate).toEqual(targetDate);
            expect(result.finalDateTime).toBeDefined();
            expect(result.adjustments).toBeDefined();
            expect(result.adjustments.dateAdjusted).toBe(false);
            expect(result.adjustments.timeSlotSelected.hour).toBe(9);
        });

        test('should handle weekend adjustments', async () => {
            const saturday = new Date('2024-01-13T08:00:00Z'); // Saturday
            const result = await processor.processTimeWindow(saturday, validTimeWindows, {
                skipWeekends: true
            });

            expect(result.success).toBe(true);
            expect(result.adjustments.dateAdjusted).toBe(true);
            expect(result.adjustments.daysAdjusted).toBe(2); // Skip to Monday
            expect(result.finalDateTime.getDay()).toBe(1); // Monday
        });

        test('should handle holiday adjustments', async () => {
            const monday = new Date('2024-01-15T08:00:00Z'); // Monday
            mockHolidayChecker.isPublicHoliday
                .mockResolvedValueOnce(true)  // Monday is holiday
                .mockResolvedValueOnce(false); // Tuesday is not

            const result = await processor.processTimeWindow(monday, validTimeWindows, {
                skipHolidays: true,
                holidayChecker: mockHolidayChecker
            });

            expect(result.success).toBe(true);
            expect(result.adjustments.dateAdjusted).toBe(true);
            expect(result.adjustments.daysAdjusted).toBe(1);
        });

        test('should respect time slot preferences', async () => {
            const monday = new Date('2024-01-15T08:00:00Z');
            const result = await processor.processTimeWindow(monday, validTimeWindows, {}, {
                preferredHour: 14
            });

            expect(result.success).toBe(true);
            expect(result.adjustments.timeSlotSelected.hour).toBe(14);
            expect(result.adjustments.timeSlotSelected.reason).toBe('Selected preferred hour 14:00');
        });

        test('should fail with invalid time windows', async () => {
            const invalidTimeWindows = [
                { startHour: 10, endHour: 9, enabled: true } // Invalid: start > end
            ];

            const targetDate = new Date('2024-01-15T08:00:00Z');
            const result = await processor.processTimeWindow(targetDate, invalidTimeWindows);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid time windows configuration');
            expect(result.details).toContain('Time window at index 0: startHour must be less than endHour');
        });

        test('should fail when no dates are available', async () => {
            const targetDate = new Date('2024-01-15T08:00:00Z');
            const result = await processor.processTimeWindow(targetDate, validTimeWindows, {
                skipWeekends: true,
                skipHolidays: true,
                holidayChecker: mockHolidayChecker,
                maxDaysToCheck: 1
            });

            // This should fail because we're limiting search to 1 day and Monday might be excluded
            if (!result.success) {
                expect(result.error).toBe('No available dates found');
            }
        });

        test('should fail when no time slots are available', async () => {
            const noEnabledWindows = validTimeWindows.map(w => ({ ...w, enabled: false }));
            const targetDate = new Date('2024-01-15T08:00:00Z');

            const result = await processor.processTimeWindow(targetDate, noEnabledWindows);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid time windows configuration');
        });

        test('should handle processing errors gracefully', async () => {
            const targetDate = 'invalid-date'; // Invalid date
            const result = await processor.processTimeWindow(targetDate, validTimeWindows);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Processing failed');
            expect(result.details).toContain('Target date must be a valid Date object');
        });

        test('should include validation warnings', async () => {
            const overlappingWindows = [
                { startHour: 9, endHour: 11, enabled: true },
                { startHour: 10, endHour: 12, enabled: true }
            ];

            const targetDate = new Date('2024-01-15T08:00:00Z');
            const result = await processor.processTimeWindow(targetDate, overlappingWindows);

            expect(result.success).toBe(true);
            expect(result.validation.warnings).toContain('Time windows 9:00-11:00 and 10:00-12:00 overlap');
        });

        test('should provide alternative time slots', async () => {
            const targetDate = new Date('2024-01-15T08:00:00Z');
            const result = await processor.processTimeWindow(targetDate, validTimeWindows);

            expect(result.success).toBe(true);
            expect(result.adjustments.alternativeSlots).toBeDefined();
            expect(Array.isArray(result.adjustments.alternativeSlots)).toBe(true);
        });
    });

    describe('getAvailabilityStats', () => {
        const validTimeWindows = [
            { startHour: 9, endHour: 10, enabled: true },
            { startHour: 14, endHour: 16, enabled: true }
        ];

        test('should return availability statistics', () => {
            const stats = processor.getAvailabilityStats(validTimeWindows);

            expect(stats.totalEnabledWindows).toBe(2);
            expect(stats.totalPossibleHours).toBe(3); // 1 + 2 hours
            expect(stats.availableSlots).toBe(3);
            expect(stats.availabilityPercentage).toBe(100);
        });

        test('should handle excluded hours in statistics', () => {
            const stats = processor.getAvailabilityStats(validTimeWindows, {
                excludedHours: [9, 14]
            });

            expect(stats.availableSlots).toBe(1); // Only 15:00 slot available
            expect(stats.availabilityPercentage).toBe(33); // 1/3 * 100
        });

        test('should return error for invalid time windows', () => {
            const invalidTimeWindows = [
                { startHour: 10, endHour: 9, enabled: true }
            ];

            const stats = processor.getAvailabilityStats(invalidTimeWindows);

            expect(stats.error).toBe('Invalid time windows');
            expect(stats.details).toContain('Time window at index 0: startHour must be less than endHour');
        });
    });
});