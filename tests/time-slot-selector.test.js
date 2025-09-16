/**
 * Tests for Time Slot Selector
 */

const TimeSlotSelector = require('../src/timewindow/time-slot-selector');

describe('TimeSlotSelector', () => {
    let selector;
    let testDate;
    let timeWindows;

    beforeEach(() => {
        selector = new TimeSlotSelector();
        testDate = new Date('2024-01-15T08:00:00Z'); // Monday
        timeWindows = [
            { startHour: 9, endHour: 10, enabled: true },
            { startHour: 14, endHour: 16, enabled: true },
            { startHour: 17, endHour: 18, enabled: false }
        ];
    });

    describe('selectOptimalTimeSlot', () => {
        test('should select earliest available time slot by default', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows);

            expect(result.success).toBe(true);
            expect(result.selectedSlot.hour).toBe(9);
            expect(result.selectedSlot.minute).toBe(0);
            expect(result.selectedSlot.reason).toBe('Selected earliest available time slot');
        });

        test('should select preferred hour when available', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows, {
                preferredHour: 14
            });

            expect(result.success).toBe(true);
            expect(result.selectedSlot.hour).toBe(14);
            expect(result.selectedSlot.reason).toBe('Selected preferred hour 14:00');
        });

        test('should fall back to earliest when preferred hour not available', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows, {
                preferredHour: 12 // Not in any enabled window
            });

            expect(result.success).toBe(true);
            expect(result.selectedSlot.hour).toBe(9);
            expect(result.selectedSlot.reason).toBe('Selected earliest available time slot');
        });

        test('should respect excluded hours', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows, {
                excludedHours: [9]
            });

            expect(result.success).toBe(true);
            expect(result.selectedSlot.hour).toBe(14);
        });

        test('should fail when no time windows are enabled', () => {
            const disabledWindows = timeWindows.map(w => ({ ...w, enabled: false }));
            const result = selector.selectOptimalTimeSlot(testDate, disabledWindows);

            expect(result.success).toBe(false);
            expect(result.error).toBe('No enabled time windows available');
        });

        test('should fail when all slots are excluded', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows, {
                excludedHours: [9, 14, 15]
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('No available time slots after applying exclusions');
        });

        test('should throw error for invalid target date', () => {
            expect(() => {
                selector.selectOptimalTimeSlot('invalid-date', timeWindows);
            }).toThrow('Target date must be a valid Date object');
        });

        test('should throw error for invalid time windows', () => {
            expect(() => {
                selector.selectOptimalTimeSlot(testDate, 'invalid');
            }).toThrow('Time windows must be provided as an array');
        });

        test('should return alternative slots', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows);

            expect(result.success).toBe(true);
            expect(result.alternativeSlots).toBeDefined();
            expect(result.alternativeSlots.length).toBeGreaterThan(0);
            expect(result.alternativeSlots[0].hour).toBe(14); // Next available after 9
        });

        test('should prioritize later slots when prioritizeEarlier is false', () => {
            const result = selector.selectOptimalTimeSlot(testDate, timeWindows, {
                prioritizeEarlier: false
            });

            expect(result.success).toBe(true);
            expect(result.selectedSlot.hour).toBe(15); // Latest available slot
            expect(result.selectedSlot.reason).toBe('Selected latest available time slot');
        });
    });

    describe('getAvailableTimeSlots', () => {
        test('should return all slots from enabled windows', () => {
            const enabledWindows = timeWindows.filter(w => w.enabled);
            const slots = selector.getAvailableTimeSlots(enabledWindows);

            expect(slots).toHaveLength(3); // 9-10 (1 slot) + 14-16 (2 slots)
            expect(slots[0]).toEqual({
                hour: 9,
                minute: 0,
                window: 0,
                windowStart: 9,
                windowEnd: 10
            });
            expect(slots[1]).toEqual({
                hour: 14,
                minute: 0,
                window: 1,
                windowStart: 14,
                windowEnd: 16
            });
        });

        test('should exclude specified hours', () => {
            const enabledWindows = timeWindows.filter(w => w.enabled);
            const slots = selector.getAvailableTimeSlots(enabledWindows, [9, 15]);

            expect(slots).toHaveLength(1);
            expect(slots[0].hour).toBe(14);
        });

        test('should handle partial hour windows', () => {
            const partialWindows = [
                { startHour: 9.5, endHour: 10, enabled: true }
            ];
            const slots = selector.getAvailableTimeSlots(partialWindows);

            expect(slots).toHaveLength(1);
            expect(slots[0]).toEqual({
                hour: 9,
                minute: 30,
                window: 0,
                windowStart: 9.5,
                windowEnd: 10
            });
        });

        test('should sort slots by time', () => {
            const mixedWindows = [
                { startHour: 14, endHour: 15, enabled: true },
                { startHour: 9, endHour: 10, enabled: true }
            ];
            const slots = selector.getAvailableTimeSlots(mixedWindows);

            expect(slots[0].hour).toBe(9);
            expect(slots[1].hour).toBe(14);
        });
    });

    describe('selectBestSlot', () => {
        const availableSlots = [
            { hour: 9, minute: 0 },
            { hour: 14, minute: 0 },
            { hour: 15, minute: 0 }
        ];

        test('should select preferred hour when available', () => {
            const result = selector.selectBestSlot(availableSlots, 14, true);

            expect(result.hour).toBe(14);
            expect(result.reason).toBe('Selected preferred hour 14:00');
        });

        test('should select earliest when prioritizeEarlier is true', () => {
            const result = selector.selectBestSlot(availableSlots, null, true);

            expect(result.hour).toBe(9);
            expect(result.reason).toBe('Selected earliest available time slot');
        });

        test('should select latest when prioritizeEarlier is false', () => {
            const result = selector.selectBestSlot(availableSlots, null, false);

            expect(result.hour).toBe(15);
            expect(result.reason).toBe('Selected latest available time slot');
        });

        test('should throw error for empty slots array', () => {
            expect(() => {
                selector.selectBestSlot([], null, true);
            }).toThrow('No available slots to select from');
        });
    });

    describe('findNextAvailableSlot', () => {
        test('should find slot on same day when available', () => {
            const result = selector.findNextAvailableSlot(testDate, timeWindows);

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(0);
            expect(result.selectedSlot.hour).toBe(9);
        });

        test('should find slot on next day when current day unavailable', () => {
            const unavailableSlots = [
                { date: '2024-01-15', hour: 9 },
                { date: '2024-01-15', hour: 14 },
                { date: '2024-01-15', hour: 15 }
            ];

            const result = selector.findNextAvailableSlot(testDate, timeWindows, unavailableSlots);

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(1);
        });

        test('should skip weekends when option is enabled', () => {
            const fridayDate = new Date('2024-01-12T08:00:00Z'); // Friday
            const unavailableSlots = [
                { date: '2024-01-12', hour: 9 },
                { date: '2024-01-12', hour: 14 },
                { date: '2024-01-12', hour: 15 }
            ];

            const result = selector.findNextAvailableSlot(fridayDate, timeWindows, unavailableSlots, {
                skipWeekends: true
            });

            expect(result.success).toBe(true);
            expect(result.daysAdjusted).toBe(3); // Skip Sat, Sun, find on Monday
        });

        test('should fail when no slots found within max days', () => {
            const unavailableSlots = [];
            // Create unavailable slots for many days
            for (let day = 15; day < 25; day++) {
                unavailableSlots.push(
                    { date: `2024-01-${day}`, hour: 9 },
                    { date: `2024-01-${day}`, hour: 14 },
                    { date: `2024-01-${day}`, hour: 15 }
                );
            }

            const result = selector.findNextAvailableSlot(testDate, timeWindows, unavailableSlots, {
                maxDaysToCheck: 5
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('No available time slots found within 5 days');
        });
    });

    describe('isWeekend', () => {
        test('should identify Saturday as weekend', () => {
            const saturday = new Date('2024-01-13T08:00:00Z');
            expect(selector.isWeekend(saturday)).toBe(true);
        });

        test('should identify Sunday as weekend', () => {
            const sunday = new Date('2024-01-14T08:00:00Z');
            expect(selector.isWeekend(sunday)).toBe(true);
        });

        test('should identify Monday as not weekend', () => {
            const monday = new Date('2024-01-15T08:00:00Z');
            expect(selector.isWeekend(monday)).toBe(false);
        });
    });

    describe('validateSelectionParameters', () => {
        test('should validate correct parameters', () => {
            const result = selector.validateSelectionParameters(testDate, timeWindows);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should fail for invalid date', () => {
            const result = selector.validateSelectionParameters(new Date('invalid'), timeWindows);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Target date must be a valid Date object');
        });

        test('should fail for invalid time windows', () => {
            const result = selector.validateSelectionParameters(testDate, 'invalid');

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time windows must be provided as an array');
        });

        test('should fail when no windows are enabled', () => {
            const disabledWindows = timeWindows.map(w => ({ ...w, enabled: false }));
            const result = selector.validateSelectionParameters(testDate, disabledWindows);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('At least one time window must be enabled');
        });

        test('should fail for invalid preferred hour', () => {
            const result = selector.validateSelectionParameters(testDate, timeWindows, {
                preferredHour: 25
            });

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Preferred hour must be a number between 0 and 23');
        });
    });

    describe('getAvailabilityStats', () => {
        test('should calculate availability statistics', () => {
            const stats = selector.getAvailabilityStats(timeWindows);

            expect(stats.totalEnabledWindows).toBe(2);
            expect(stats.totalPossibleHours).toBe(3); // (10-9) + (16-14)
            expect(stats.availableSlots).toBe(3);
            expect(stats.excludedHours).toBe(0);
            expect(stats.availabilityPercentage).toBe(100);
            expect(stats.earliestSlot.hour).toBe(9);
            expect(stats.latestSlot.hour).toBe(15);
        });

        test('should handle excluded hours in statistics', () => {
            const stats = selector.getAvailabilityStats(timeWindows, [9, 14]);

            expect(stats.availableSlots).toBe(1);
            expect(stats.excludedHours).toBe(2);
            expect(stats.availabilityPercentage).toBe(33); // 1/3 * 100
        });

        test('should handle no enabled windows', () => {
            const disabledWindows = timeWindows.map(w => ({ ...w, enabled: false }));
            const stats = selector.getAvailabilityStats(disabledWindows);

            expect(stats.totalEnabledWindows).toBe(0);
            expect(stats.totalPossibleHours).toBe(0);
            expect(stats.availabilityPercentage).toBe(0);
            expect(stats.earliestSlot).toBe(null);
            expect(stats.latestSlot).toBe(null);
        });
    });
});