/**
 * Tests for Time Window Validator
 */

const TimeWindowValidator = require('../src/timewindow/time-window-validator');

describe('TimeWindowValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new TimeWindowValidator();
    });

    describe('validateTimeWindows', () => {
        test('should validate valid time windows', () => {
            const timeWindows = [
                { startHour: 9, endHour: 10, enabled: true },
                { startHour: 14, endHour: 15, enabled: true },
                { startHour: 16, endHour: 17, enabled: false }
            ];

            const result = validator.validateTimeWindows(timeWindows);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should fail when no time windows provided', () => {
            const result = validator.validateTimeWindows(null);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time windows must be provided as an array');
        });

        test('should fail when time windows is not an array', () => {
            const result = validator.validateTimeWindows('invalid');

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time windows must be provided as an array');
        });

        test('should fail when no time windows are enabled', () => {
            const timeWindows = [
                { startHour: 9, endHour: 10, enabled: false },
                { startHour: 14, endHour: 15, enabled: false }
            ];

            const result = validator.validateTimeWindows(timeWindows);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('At least one time window must be selected');
        });

        test('should detect overlapping time windows', () => {
            const timeWindows = [
                { startHour: 9, endHour: 11, enabled: true },
                { startHour: 10, endHour: 12, enabled: true }
            ];

            const result = validator.validateTimeWindows(timeWindows);

            expect(result.isValid).toBe(true);
            expect(result.warnings).toContain('Time windows 9:00-11:00 and 10:00-12:00 overlap');
        });
    });

    describe('validateSingleTimeWindow', () => {
        test('should validate a valid time window', () => {
            const window = { startHour: 9, endHour: 10, enabled: true };
            const result = validator.validateSingleTimeWindow(window, 0);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should fail for invalid startHour', () => {
            const window = { startHour: 25, endHour: 10, enabled: true };
            const result = validator.validateSingleTimeWindow(window, 0);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time window at index 0: startHour must be between 0 and 23');
        });

        test('should fail for invalid endHour', () => {
            const window = { startHour: 9, endHour: -1, enabled: true };
            const result = validator.validateSingleTimeWindow(window, 0);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time window at index 0: endHour must be between 0 and 23');
        });

        test('should fail when startHour >= endHour', () => {
            const window = { startHour: 10, endHour: 9, enabled: true };
            const result = validator.validateSingleTimeWindow(window, 0);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time window at index 0: startHour must be less than endHour');
        });

        test('should fail for non-boolean enabled flag', () => {
            const window = { startHour: 9, endHour: 10, enabled: 'true' };
            const result = validator.validateSingleTimeWindow(window, 0);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Time window at index 0: enabled must be a boolean');
        });

        test('should warn about very short time windows', () => {
            const window = { startHour: 9, endHour: 9.5, enabled: true };
            const result = validator.validateSingleTimeWindow(window, 0);

            expect(result.warnings).toContain('Time window at index 0: Very short time window (less than 1 hour)');
        });
    });

    describe('doTimeWindowsOverlap', () => {
        test('should detect overlapping windows', () => {
            const window1 = { startHour: 9, endHour: 11 };
            const window2 = { startHour: 10, endHour: 12 };

            expect(validator.doTimeWindowsOverlap(window1, window2)).toBe(true);
        });

        test('should detect non-overlapping windows', () => {
            const window1 = { startHour: 9, endHour: 10 };
            const window2 = { startHour: 11, endHour: 12 };

            expect(validator.doTimeWindowsOverlap(window1, window2)).toBe(false);
        });

        test('should detect adjacent windows as non-overlapping', () => {
            const window1 = { startHour: 9, endHour: 10 };
            const window2 = { startHour: 10, endHour: 11 };

            expect(validator.doTimeWindowsOverlap(window1, window2)).toBe(false);
        });
    });

    describe('resolveTimeWindowConflicts', () => {
        test('should merge overlapping time windows', () => {
            const timeWindows = [
                { startHour: 9, endHour: 11, enabled: true },
                { startHour: 10, endHour: 12, enabled: true },
                { startHour: 14, endHour: 15, enabled: false }
            ];

            const resolved = validator.resolveTimeWindowConflicts(timeWindows);

            expect(resolved).toHaveLength(2);
            expect(resolved[0]).toEqual({ startHour: 9, endHour: 12, enabled: true });
            expect(resolved[1]).toEqual({ startHour: 14, endHour: 15, enabled: false });
        });

        test('should handle adjacent time windows', () => {
            const timeWindows = [
                { startHour: 9, endHour: 10, enabled: true },
                { startHour: 10, endHour: 11, enabled: true }
            ];

            const resolved = validator.resolveTimeWindowConflicts(timeWindows);

            expect(resolved).toHaveLength(1);
            expect(resolved[0]).toEqual({ startHour: 9, endHour: 11, enabled: true });
        });

        test('should throw error for invalid time windows', () => {
            const timeWindows = [
                { startHour: 10, endHour: 9, enabled: true } // Invalid: start > end
            ];

            expect(() => {
                validator.resolveTimeWindowConflicts(timeWindows);
            }).toThrow('Cannot resolve conflicts in invalid time windows');
        });
    });

    describe('createDefaultTimeWindows', () => {
        test('should create default business hours time windows', () => {
            const defaultWindows = validator.createDefaultTimeWindows();

            expect(defaultWindows).toHaveLength(8); // 9 AM to 5 PM = 8 hours
            expect(defaultWindows[0]).toEqual({ startHour: 9, endHour: 10, enabled: true });
            expect(defaultWindows[3]).toEqual({ startHour: 12, endHour: 13, enabled: true });
            expect(defaultWindows[7]).toEqual({ startHour: 16, endHour: 17, enabled: false });
        });
    });
});