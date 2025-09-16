/**
 * Time Slot Selector
 * Selects optimal time slots within configured time windows
 */

class TimeSlotSelector {
    /**
     * Selects the best available time slot for a given date and time windows
     * @param {Date} targetDate - The target date for sending
     * @param {Array} timeWindows - Array of enabled time windows
     * @param {Object} options - Additional options for selection
     * @returns {Object} Selected time slot result
     */
    selectOptimalTimeSlot(targetDate, timeWindows, options = {}) {
        const {
            preferredHour = null,
            excludedHours = [],
            prioritizeEarlier = true
        } = options;

        // Validate inputs
        if (!targetDate || !(targetDate instanceof Date)) {
            throw new Error('Target date must be a valid Date object');
        }

        if (!timeWindows || !Array.isArray(timeWindows)) {
            throw new Error('Time windows must be provided as an array');
        }

        const enabledWindows = timeWindows.filter(window => window.enabled === true);
        if (enabledWindows.length === 0) {
            return {
                success: false,
                error: 'No enabled time windows available',
                selectedSlot: null
            };
        }

        // Get available time slots from enabled windows
        const availableSlots = this.getAvailableTimeSlots(enabledWindows, excludedHours);
        
        if (availableSlots.length === 0) {
            return {
                success: false,
                error: 'No available time slots after applying exclusions',
                selectedSlot: null
            };
        }

        // Select the best slot based on preferences
        const selectedSlot = this.selectBestSlot(availableSlots, preferredHour, prioritizeEarlier);

        // Create the final datetime
        const selectedDateTime = new Date(targetDate);
        selectedDateTime.setHours(selectedSlot.hour, selectedSlot.minute || 0, 0, 0);

        return {
            success: true,
            selectedSlot: {
                hour: selectedSlot.hour,
                minute: selectedSlot.minute || 0,
                datetime: selectedDateTime,
                window: selectedSlot.window,
                reason: selectedSlot.reason
            },
            alternativeSlots: availableSlots.filter(slot => 
                slot.hour !== selectedSlot.hour || slot.minute !== selectedSlot.minute
            ).slice(0, 3) // Return up to 3 alternatives
        };
    }

    /**
     * Gets all available time slots from enabled time windows
     * @param {Array} enabledWindows - Array of enabled time windows
     * @param {Array} excludedHours - Hours to exclude from selection
     * @returns {Array} Array of available time slots
     */
    getAvailableTimeSlots(enabledWindows, excludedHours = []) {
        const slots = [];

        enabledWindows.forEach((window, windowIndex) => {
            // Handle partial hour start times
            if (window.startHour % 1 !== 0) {
                const startHour = Math.floor(window.startHour);
                const startMinute = (window.startHour % 1) * 60;
                if (!excludedHours.includes(startHour)) {
                    slots.push({
                        hour: startHour,
                        minute: startMinute,
                        window: windowIndex,
                        windowStart: window.startHour,
                        windowEnd: window.endHour
                    });
                }
                
                // Generate hourly slots from the next full hour
                for (let hour = Math.ceil(window.startHour); hour < window.endHour; hour++) {
                    if (!excludedHours.includes(hour)) {
                        slots.push({
                            hour: hour,
                            minute: 0,
                            window: windowIndex,
                            windowStart: window.startHour,
                            windowEnd: window.endHour
                        });
                    }
                }
            } else {
                // Generate hourly slots within the window for full hour starts
                for (let hour = window.startHour; hour < window.endHour; hour++) {
                    if (!excludedHours.includes(hour)) {
                        slots.push({
                            hour: hour,
                            minute: 0,
                            window: windowIndex,
                            windowStart: window.startHour,
                            windowEnd: window.endHour
                        });
                    }
                }
            }
        });

        // Sort slots by time (hour, then minute)
        slots.sort((a, b) => {
            if (a.hour !== b.hour) {
                return a.hour - b.hour;
            }
            return (a.minute || 0) - (b.minute || 0);
        });

        return slots;
    }

    /**
     * Selects the best slot from available options
     * @param {Array} availableSlots - Array of available time slots
     * @param {number} preferredHour - Preferred hour (optional)
     * @param {boolean} prioritizeEarlier - Whether to prioritize earlier times
     * @returns {Object} Best time slot
     */
    selectBestSlot(availableSlots, preferredHour = null, prioritizeEarlier = true) {
        if (availableSlots.length === 0) {
            throw new Error('No available slots to select from');
        }

        // If preferred hour is specified and available, use it
        if (preferredHour !== null) {
            const preferredSlot = availableSlots.find(slot => slot.hour === preferredHour);
            if (preferredSlot) {
                return {
                    ...preferredSlot,
                    reason: `Selected preferred hour ${preferredHour}:00`
                };
            }
        }

        // Otherwise, select based on priority strategy
        if (prioritizeEarlier) {
            return {
                ...availableSlots[0],
                reason: 'Selected earliest available time slot'
            };
        } else {
            return {
                ...availableSlots[availableSlots.length - 1],
                reason: 'Selected latest available time slot'
            };
        }
    }

    /**
     * Finds the next available time slot when preferred slots are unavailable
     * @param {Date} targetDate - Target date
     * @param {Array} timeWindows - Time windows configuration
     * @param {Array} unavailableSlots - Slots that are not available
     * @param {Object} options - Selection options
     * @returns {Object} Next available slot result
     */
    findNextAvailableSlot(targetDate, timeWindows, unavailableSlots = [], options = {}) {
        const maxDaysToCheck = options.maxDaysToCheck || 7;
        let currentDate = new Date(targetDate);

        for (let dayOffset = 0; dayOffset < maxDaysToCheck; dayOffset++) {
            // Skip weekends if specified in options
            if (options.skipWeekends && this.isWeekend(currentDate)) {
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }

            // Get excluded hours for this specific date
            const excludedHours = this.getExcludedHoursForDate(currentDate, unavailableSlots);

            // Try to find a slot for this date
            const slotResult = this.selectOptimalTimeSlot(currentDate, timeWindows, {
                ...options,
                excludedHours
            });

            if (slotResult.success) {
                return {
                    ...slotResult,
                    daysAdjusted: dayOffset,
                    originalDate: targetDate
                };
            }

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return {
            success: false,
            error: `No available time slots found within ${maxDaysToCheck} days`,
            daysChecked: maxDaysToCheck
        };
    }

    /**
     * Gets excluded hours for a specific date based on unavailable slots
     * @param {Date} date - The date to check
     * @param {Array} unavailableSlots - Array of unavailable slot objects
     * @returns {Array} Array of excluded hours
     */
    getExcludedHoursForDate(date, unavailableSlots) {
        const dateString = date.toISOString().split('T')[0];
        return unavailableSlots
            .filter(slot => slot.date === dateString)
            .map(slot => slot.hour);
    }

    /**
     * Checks if a date falls on a weekend
     * @param {Date} date - Date to check
     * @returns {boolean} True if weekend
     */
    isWeekend(date) {
        const dayOfWeek = date.getDay();
        return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
    }

    /**
     * Validates time slot selection parameters
     * @param {Date} targetDate - Target date
     * @param {Array} timeWindows - Time windows
     * @param {Object} options - Options object
     * @returns {Object} Validation result
     */
    validateSelectionParameters(targetDate, timeWindows, options = {}) {
        const errors = [];

        if (!targetDate || !(targetDate instanceof Date) || isNaN(targetDate.getTime())) {
            errors.push('Target date must be a valid Date object');
        }

        if (!timeWindows || !Array.isArray(timeWindows)) {
            errors.push('Time windows must be provided as an array');
        } else {
            const enabledWindows = timeWindows.filter(w => w.enabled);
            if (enabledWindows.length === 0) {
                errors.push('At least one time window must be enabled');
            }
        }

        if (options.preferredHour !== null && options.preferredHour !== undefined) {
            if (typeof options.preferredHour !== 'number' || 
                options.preferredHour < 0 || options.preferredHour > 23) {
                errors.push('Preferred hour must be a number between 0 and 23');
            }
        }

        if (options.excludedHours && !Array.isArray(options.excludedHours)) {
            errors.push('Excluded hours must be an array');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Gets statistics about time slot availability
     * @param {Array} timeWindows - Time windows configuration
     * @param {Array} excludedHours - Excluded hours
     * @returns {Object} Availability statistics
     */
    getAvailabilityStats(timeWindows, excludedHours = []) {
        const enabledWindows = timeWindows.filter(w => w.enabled);
        const availableSlots = this.getAvailableTimeSlots(enabledWindows, excludedHours);

        const totalPossibleHours = enabledWindows.reduce((total, window) => {
            return total + (window.endHour - window.startHour);
        }, 0);

        return {
            totalEnabledWindows: enabledWindows.length,
            totalPossibleHours,
            availableSlots: availableSlots.length,
            excludedHours: excludedHours.length,
            availabilityPercentage: totalPossibleHours > 0 
                ? Math.round((availableSlots.length / totalPossibleHours) * 100) 
                : 0,
            earliestSlot: availableSlots.length > 0 ? availableSlots[0] : null,
            latestSlot: availableSlots.length > 0 ? availableSlots[availableSlots.length - 1] : null
        };
    }
}

module.exports = TimeSlotSelector;