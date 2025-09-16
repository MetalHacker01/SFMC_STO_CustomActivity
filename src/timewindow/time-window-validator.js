/**
 * Time Window Validator
 * Validates user-selected time windows and ensures business rules are met
 */

class TimeWindowValidator {
    /**
     * Validates a set of time windows
     * @param {Array} timeWindows - Array of time window objects
     * @returns {Object} Validation result with success flag and errors
     */
    validateTimeWindows(timeWindows) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Check if timeWindows is provided and is an array
        if (!timeWindows || !Array.isArray(timeWindows)) {
            result.isValid = false;
            result.errors.push('Time windows must be provided as an array');
            return result;
        }

        // Ensure at least one time window is selected
        const enabledWindows = timeWindows.filter(window => window.enabled === true);
        if (enabledWindows.length === 0) {
            result.isValid = false;
            result.errors.push('At least one time window must be selected');
        }

        // Validate each time window
        timeWindows.forEach((window, index) => {
            const windowValidation = this.validateSingleTimeWindow(window, index);
            if (!windowValidation.isValid) {
                result.isValid = false;
                result.errors.push(...windowValidation.errors);
            }
            result.warnings.push(...windowValidation.warnings);
        });

        // Check for overlapping time windows
        const overlaps = this.detectTimeWindowOverlaps(enabledWindows);
        if (overlaps.length > 0) {
            result.warnings.push(...overlaps.map(overlap => 
                `Time windows ${overlap.window1} and ${overlap.window2} overlap`
            ));
        }

        return result;
    }

    /**
     * Validates a single time window object
     * @param {Object} window - Time window object
     * @param {number} index - Index of the window in the array
     * @returns {Object} Validation result
     */
    validateSingleTimeWindow(window, index) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Check required properties
        if (typeof window !== 'object' || window === null) {
            result.isValid = false;
            result.errors.push(`Time window at index ${index} must be an object`);
            return result;
        }

        // Validate startHour
        if (typeof window.startHour !== 'number') {
            result.isValid = false;
            result.errors.push(`Time window at index ${index}: startHour must be a number`);
        } else if (window.startHour < 0 || window.startHour > 23) {
            result.isValid = false;
            result.errors.push(`Time window at index ${index}: startHour must be between 0 and 23`);
        }

        // Validate endHour
        if (typeof window.endHour !== 'number') {
            result.isValid = false;
            result.errors.push(`Time window at index ${index}: endHour must be a number`);
        } else if (window.endHour < 0 || window.endHour > 23) {
            result.isValid = false;
            result.errors.push(`Time window at index ${index}: endHour must be between 0 and 23`);
        }

        // Validate enabled flag
        if (typeof window.enabled !== 'boolean') {
            result.isValid = false;
            result.errors.push(`Time window at index ${index}: enabled must be a boolean`);
        }

        // Check that startHour is before endHour
        if (typeof window.startHour === 'number' && typeof window.endHour === 'number') {
            if (window.startHour >= window.endHour) {
                result.isValid = false;
                result.errors.push(`Time window at index ${index}: startHour must be less than endHour`);
            }
        }

        // Warn about very short time windows (less than 1 hour)
        if (typeof window.startHour === 'number' && typeof window.endHour === 'number') {
            if (window.endHour - window.startHour < 1) {
                result.warnings.push(`Time window at index ${index}: Very short time window (less than 1 hour)`);
            }
        }

        return result;
    }

    /**
     * Detects overlapping time windows
     * @param {Array} enabledWindows - Array of enabled time windows
     * @returns {Array} Array of overlap objects
     */
    detectTimeWindowOverlaps(enabledWindows) {
        const overlaps = [];

        for (let i = 0; i < enabledWindows.length; i++) {
            for (let j = i + 1; j < enabledWindows.length; j++) {
                const window1 = enabledWindows[i];
                const window2 = enabledWindows[j];

                // Check if windows overlap
                if (this.doTimeWindowsOverlap(window1, window2)) {
                    overlaps.push({
                        window1: `${window1.startHour}:00-${window1.endHour}:00`,
                        window2: `${window2.startHour}:00-${window2.endHour}:00`
                    });
                }
            }
        }

        return overlaps;
    }

    /**
     * Checks if two time windows overlap
     * @param {Object} window1 - First time window
     * @param {Object} window2 - Second time window
     * @returns {boolean} True if windows overlap
     */
    doTimeWindowsOverlap(window1, window2) {
        return window1.startHour < window2.endHour && window2.startHour < window1.endHour;
    }

    /**
     * Resolves conflicts in time windows by merging overlapping windows
     * @param {Array} timeWindows - Array of time windows
     * @returns {Array} Array of resolved time windows
     */
    resolveTimeWindowConflicts(timeWindows) {
        const validationResult = this.validateTimeWindows(timeWindows);
        if (!validationResult.isValid) {
            throw new Error(`Cannot resolve conflicts in invalid time windows: ${validationResult.errors.join(', ')}`);
        }

        const enabledWindows = timeWindows.filter(window => window.enabled);
        const disabledWindows = timeWindows.filter(window => !window.enabled);

        // Sort enabled windows by start time
        enabledWindows.sort((a, b) => a.startHour - b.startHour);

        // Merge overlapping windows
        const mergedWindows = [];
        let currentWindow = null;

        for (const window of enabledWindows) {
            if (!currentWindow) {
                currentWindow = { ...window };
            } else if (window.startHour <= currentWindow.endHour) {
                // Overlapping or adjacent - merge
                currentWindow.endHour = Math.max(currentWindow.endHour, window.endHour);
            } else {
                // No overlap - add current window and start new one
                mergedWindows.push(currentWindow);
                currentWindow = { ...window };
            }
        }

        if (currentWindow) {
            mergedWindows.push(currentWindow);
        }

        // Return merged enabled windows plus original disabled windows
        return [...mergedWindows, ...disabledWindows];
    }

    /**
     * Creates default time windows configuration
     * @returns {Array} Default time windows (9 AM to 5 PM business hours)
     */
    createDefaultTimeWindows() {
        const defaultWindows = [];
        
        // Create hourly windows from 9 AM to 5 PM
        for (let hour = 9; hour < 17; hour++) {
            defaultWindows.push({
                startHour: hour,
                endHour: hour + 1,
                enabled: hour >= 9 && hour <= 12 // Enable morning hours by default
            });
        }

        return defaultWindows;
    }
}

module.exports = TimeWindowValidator;