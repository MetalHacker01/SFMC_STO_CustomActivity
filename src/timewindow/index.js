/**
 * Time Window Processor Module
 * Handles time window validation, selection, and date adjustments
 */

const TimeWindowValidator = require('./time-window-validator');
const TimeSlotSelector = require('./time-slot-selector');
const DateAdjuster = require('./date-adjuster');

/**
 * Main Time Window Processor class that combines all functionality
 */
class TimeWindowProcessor {
    constructor() {
        this.validator = new TimeWindowValidator();
        this.selector = new TimeSlotSelector();
        this.adjuster = new DateAdjuster();
    }

    /**
     * Processes a complete time window selection with date adjustments
     * @param {Date} targetDate - Target date for sending
     * @param {Array} timeWindows - Time window configuration
     * @param {Object} exclusionRules - Weekend/holiday exclusion rules
     * @param {Object} options - Additional options
     * @returns {Object} Complete processing result
     */
    async processTimeWindow(targetDate, timeWindows, exclusionRules = {}, options = {}) {
        try {
            // Step 1: Validate time windows
            const validation = this.validator.validateTimeWindows(timeWindows);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: 'Invalid time windows configuration',
                    details: validation.errors
                };
            }

            // Step 2: Adjust date for exclusions (weekends/holidays)
            const dateAdjustment = await this.adjuster.adjustDateForExclusions(
                targetDate, 
                exclusionRules, 
                options
            );

            if (!dateAdjustment.success) {
                return {
                    success: false,
                    error: 'No available dates found',
                    details: dateAdjustment.error
                };
            }

            // Step 3: Select optimal time slot for the adjusted date
            const slotSelection = this.selector.selectOptimalTimeSlot(
                dateAdjustment.adjustedDate,
                timeWindows,
                options
            );

            if (!slotSelection.success) {
                return {
                    success: false,
                    error: 'No available time slots found',
                    details: slotSelection.error
                };
            }

            // Return complete result
            return {
                success: true,
                originalDate: targetDate,
                finalDateTime: slotSelection.selectedSlot.datetime,
                adjustments: {
                    dateAdjusted: dateAdjustment.daysAdjusted > 0,
                    daysAdjusted: dateAdjustment.daysAdjusted,
                    dateAdjustmentReason: dateAdjustment.reason,
                    timeSlotSelected: slotSelection.selectedSlot,
                    alternativeSlots: slotSelection.alternativeSlots
                },
                validation: {
                    warnings: validation.warnings
                }
            };

        } catch (error) {
            return {
                success: false,
                error: 'Processing failed',
                details: error.message
            };
        }
    }

    /**
     * Gets availability statistics for time windows
     * @param {Array} timeWindows - Time window configuration
     * @param {Object} exclusionRules - Exclusion rules
     * @returns {Object} Availability statistics
     */
    getAvailabilityStats(timeWindows, exclusionRules = {}) {
        const validation = this.validator.validateTimeWindows(timeWindows);
        if (!validation.isValid) {
            return {
                error: 'Invalid time windows',
                details: validation.errors
            };
        }

        return this.selector.getAvailabilityStats(timeWindows, exclusionRules.excludedHours || []);
    }
}

module.exports = {
    TimeWindowProcessor,
    TimeWindowValidator,
    TimeSlotSelector,
    DateAdjuster
};