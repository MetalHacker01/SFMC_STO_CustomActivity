/**
 * Date Adjuster
 * Handles date adjustments when current date is excluded due to weekends/holidays
 */

class DateAdjuster {
    /**
     * Adjusts a date to the next available date based on exclusion rules
     * @param {Date} targetDate - The original target date
     * @param {Object} exclusionRules - Rules for date exclusions
     * @param {Object} options - Additional options
     * @returns {Object} Adjustment result
     */
    async adjustDateForExclusions(targetDate, exclusionRules = {}, options = {}) {
        const {
            skipWeekends = false,
            skipHolidays = false,
            holidayChecker = null,
            maxDaysToCheck = 30
        } = exclusionRules;

        const {
            maintainTimeOfDay = true,
            preferredDayOfWeek = null,
            countryCode = 'US'
        } = options;

        // Validate inputs
        if (!targetDate || !(targetDate instanceof Date) || isNaN(targetDate.getTime())) {
            throw new Error('Target date must be a valid Date object');
        }

        let currentDate = new Date(targetDate);
        let daysAdjusted = 0;
        const adjustments = [];

        // Check if original date needs adjustment
        for (let dayOffset = 0; dayOffset < maxDaysToCheck; dayOffset++) {
            const checkResult = await this.isDateAvailable(currentDate, {
                skipWeekends,
                skipHolidays,
                holidayChecker,
                countryCode
            });

            if (checkResult.isAvailable) {
                // Found an available date
                const finalDate = new Date(currentDate);
                
                if (maintainTimeOfDay) {
                    finalDate.setUTCHours(
                        targetDate.getUTCHours(),
                        targetDate.getUTCMinutes(),
                        targetDate.getUTCSeconds(),
                        targetDate.getUTCMilliseconds()
                    );
                }

                return {
                    success: true,
                    originalDate: targetDate,
                    adjustedDate: finalDate,
                    daysAdjusted: dayOffset,
                    adjustments,
                    reason: dayOffset === 0 ? 'No adjustment needed' : 
                           `Moved ${dayOffset} day(s) forward to avoid exclusions`
                };
            }

            // Record why this date was excluded
            adjustments.push({
                date: new Date(currentDate),
                excluded: true,
                reasons: checkResult.exclusionReasons
            });

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            daysAdjusted++;
        }

        // No available date found within the limit
        return {
            success: false,
            originalDate: targetDate,
            adjustedDate: null,
            daysAdjusted: 0,
            adjustments,
            error: `No available date found within ${maxDaysToCheck} days`,
            reason: 'Maximum search days exceeded'
        };
    }

    /**
     * Checks if a specific date is available based on exclusion rules
     * @param {Date} date - Date to check
     * @param {Object} rules - Exclusion rules
     * @returns {Object} Availability result
     */
    async isDateAvailable(date, rules = {}) {
        const {
            skipWeekends = false,
            skipHolidays = false,
            holidayChecker = null,
            countryCode = 'US'
        } = rules;

        const exclusionReasons = [];
        let isAvailable = true;

        // Check weekend exclusion
        if (skipWeekends && this.isWeekend(date)) {
            isAvailable = false;
            exclusionReasons.push(`Weekend (${this.getDayName(date)})`);
        }

        // Check holiday exclusion
        if (skipHolidays && holidayChecker) {
            try {
                const isHoliday = await holidayChecker.isPublicHoliday(date, countryCode);
                if (isHoliday) {
                    isAvailable = false;
                    exclusionReasons.push('Public holiday');
                }
            } catch (error) {
                // If holiday check fails, log warning but don't exclude the date
                console.warn(`Holiday check failed for ${date.toISOString()}: ${error.message}`);
            }
        }

        return {
            isAvailable,
            exclusionReasons,
            date: new Date(date)
        };
    }

    /**
     * Handles multiple consecutive excluded days
     * @param {Date} startDate - Starting date
     * @param {Object} exclusionRules - Exclusion rules
     * @param {number} maxConsecutiveDays - Maximum consecutive days to handle
     * @returns {Object} Result with next available date
     */
    async handleConsecutiveExclusions(startDate, exclusionRules = {}, maxConsecutiveDays = 14) {
        let currentDate = new Date(startDate);
        let consecutiveExcludedDays = 0;
        const excludedDates = [];

        while (consecutiveExcludedDays < maxConsecutiveDays) {
            const availability = await this.isDateAvailable(currentDate, exclusionRules);
            
            if (availability.isAvailable) {
                return {
                    success: true,
                    nextAvailableDate: new Date(currentDate),
                    consecutiveExcludedDays,
                    excludedDates,
                    totalDaysChecked: consecutiveExcludedDays + 1
                };
            }

            excludedDates.push({
                date: new Date(currentDate),
                reasons: availability.exclusionReasons
            });

            consecutiveExcludedDays++;
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return {
            success: false,
            nextAvailableDate: null,
            consecutiveExcludedDays,
            excludedDates,
            totalDaysChecked: maxConsecutiveDays,
            error: `More than ${maxConsecutiveDays} consecutive days are excluded`
        };
    }

    /**
     * Maintains the same time of day when moving dates
     * @param {Date} originalDate - Original date with time
     * @param {Date} newDate - New date (date only)
     * @returns {Date} New date with original time
     */
    maintainTimeOfDay(originalDate, newDate) {
        const adjustedDate = new Date(newDate);
        adjustedDate.setUTCHours(
            originalDate.getUTCHours(),
            originalDate.getUTCMinutes(),
            originalDate.getUTCSeconds(),
            originalDate.getUTCMilliseconds()
        );
        return adjustedDate;
    }

    /**
     * Finds the next occurrence of a specific day of the week
     * @param {Date} startDate - Starting date
     * @param {number} targetDayOfWeek - Target day (0=Sunday, 1=Monday, etc.)
     * @param {Object} exclusionRules - Exclusion rules to apply
     * @returns {Object} Result with next occurrence
     */
    async findNextDayOfWeek(startDate, targetDayOfWeek, exclusionRules = {}) {
        if (targetDayOfWeek < 0 || targetDayOfWeek > 6) {
            throw new Error('Target day of week must be between 0 (Sunday) and 6 (Saturday)');
        }

        let currentDate = new Date(startDate);
        let daysToAdd = 0;
        const maxDaysToCheck = 14; // Check up to 2 weeks

        for (let i = 0; i < maxDaysToCheck; i++) {
            if (currentDate.getDay() === targetDayOfWeek) {
                const availability = await this.isDateAvailable(currentDate, exclusionRules);
                if (availability.isAvailable) {
                    return {
                        success: true,
                        foundDate: new Date(currentDate),
                        daysFromStart: daysToAdd,
                        dayName: this.getDayName(currentDate)
                    };
                }
            }

            currentDate.setDate(currentDate.getDate() + 1);
            daysToAdd++;
        }

        return {
            success: false,
            foundDate: null,
            daysFromStart: daysToAdd,
            error: `No available ${this.getDayName(new Date().setDay(targetDayOfWeek))} found within ${maxDaysToCheck} days`
        };
    }

    /**
     * Calculates business days between two dates
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {Object} exclusionRules - Rules for what constitutes a business day
     * @returns {Object} Business days calculation result
     */
    async calculateBusinessDays(startDate, endDate, exclusionRules = {}) {
        if (startDate >= endDate) {
            return {
                businessDays: 0,
                totalDays: 0,
                excludedDays: []
            };
        }

        let currentDate = new Date(startDate);
        let businessDays = 0;
        let totalDays = 0;
        const excludedDays = [];

        while (currentDate < endDate) {
            const availability = await this.isDateAvailable(currentDate, exclusionRules);
            
            if (availability.isAvailable) {
                businessDays++;
            } else {
                excludedDays.push({
                    date: new Date(currentDate),
                    reasons: availability.exclusionReasons
                });
            }

            totalDays++;
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return {
            businessDays,
            totalDays,
            excludedDays,
            businessDayPercentage: totalDays > 0 ? Math.round((businessDays / totalDays) * 100) : 0
        };
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
     * Gets the name of the day for a given date
     * @param {Date} date - Date to get day name for
     * @returns {string} Day name
     */
    getDayName(date) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[date.getDay()];
    }

    /**
     * Gets the next business day (Monday-Friday)
     * @param {Date} date - Starting date
     * @returns {Date} Next business day
     */
    getNextBusinessDay(date) {
        let nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        while (this.isWeekend(nextDay)) {
            nextDay.setDate(nextDay.getDate() + 1);
        }

        return nextDay;
    }

    /**
     * Validates date adjustment parameters
     * @param {Date} targetDate - Target date
     * @param {Object} exclusionRules - Exclusion rules
     * @param {Object} options - Options
     * @returns {Object} Validation result
     */
    validateAdjustmentParameters(targetDate, exclusionRules = {}, options = {}) {
        const errors = [];

        if (!targetDate || !(targetDate instanceof Date) || isNaN(targetDate.getTime())) {
            errors.push('Target date must be a valid Date object');
        }

        if (exclusionRules.maxDaysToCheck && 
            (typeof exclusionRules.maxDaysToCheck !== 'number' || exclusionRules.maxDaysToCheck < 1)) {
            errors.push('maxDaysToCheck must be a positive number');
        }

        if (options.preferredDayOfWeek !== null && options.preferredDayOfWeek !== undefined) {
            if (typeof options.preferredDayOfWeek !== 'number' || 
                options.preferredDayOfWeek < 0 || options.preferredDayOfWeek > 6) {
                errors.push('preferredDayOfWeek must be a number between 0 and 6');
            }
        }

        if (exclusionRules.skipHolidays && !exclusionRules.holidayChecker) {
            errors.push('holidayChecker is required when skipHolidays is true');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Creates a summary of date adjustments made
     * @param {Array} adjustments - Array of adjustment records
     * @returns {Object} Adjustment summary
     */
    createAdjustmentSummary(adjustments) {
        const summary = {
            totalAdjustments: adjustments.length,
            weekendExclusions: 0,
            holidayExclusions: 0,
            otherExclusions: 0,
            adjustmentsByReason: {}
        };

        adjustments.forEach(adjustment => {
            if (adjustment.excluded && adjustment.reasons) {
                adjustment.reasons.forEach(reason => {
                    if (reason.includes('Weekend')) {
                        summary.weekendExclusions++;
                    } else if (reason.includes('holiday')) {
                        summary.holidayExclusions++;
                    } else {
                        summary.otherExclusions++;
                    }

                    summary.adjustmentsByReason[reason] = 
                        (summary.adjustmentsByReason[reason] || 0) + 1;
                });
            }
        });

        return summary;
    }
}

module.exports = DateAdjuster;