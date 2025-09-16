/**
 * Send Time Calculator
 * Core algorithm that combines all factors to calculate optimal send time
 * Handles the complete workflow: timezone → time windows → weekend exclusion → holiday exclusion
 */

const moment = require('moment-timezone');

/**
 * Send Time Calculator class that implements the core optimization algorithm
 */
class SendTimeCalculator {
    constructor(config = {}, logger = console) {
        this.logger = logger;
        this.config = {
            // Default configuration
            defaultTimezone: 'America/Chicago',
            maxLookAheadDays: 30,
            minFutureMinutes: 5, // Minimum minutes in the future
            defaultTimeWindows: [
                { startHour: 9, endHour: 10, enabled: true },
                { startHour: 10, endHour: 11, enabled: true },
                { startHour: 14, endHour: 15, enabled: true },
                { startHour: 15, endHour: 16, enabled: true }
            ],
            ...config
        };
    }

    /**
     * Create the core algorithm that combines all factors to calculate optimal send time
     * @param {Object} contact - Contact information
     * @param {Object} activityConfig - Activity configuration
     * @param {Object} components - Initialized components (timezoneEngine, holidayChecker, etc.)
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Calculation result
     */
    async calculateOptimalSendTime(contact, activityConfig, components, options = {}) {
        const calculationId = this._generateCalculationId();
        const startTime = Date.now();

        this.logger.info(`Starting send time calculation [${calculationId}]`, {
            subscriberKey: contact?.subscriberKey,
            geosegment: contact?.geosegment,
            skipWeekends: activityConfig?.skipWeekends,
            skipHolidays: activityConfig?.skipHolidays,
            timeWindowsCount: activityConfig?.timeWindows?.length || 0
        });

        try {
            // Step 1: Validate inputs first
            if (!contact) {
                throw new Error('Contact data is required');
            }
            if (!activityConfig) {
                throw new Error('Activity configuration is required');
            }

            // Step 2: Initialize base time and validate inputs
            const baseTime = this._initializeBaseTime(contact, options);
            const countryCode = contact.geosegment || 'US';
            const timeWindows = this._normalizeTimeWindows(activityConfig.timeWindows);

            this.logger.debug(`Calculation initialized [${calculationId}]`, {
                baseTime: baseTime.toISOString(),
                countryCode,
                timeWindowsCount: timeWindows.length
            });

            // Step 2: Timezone conversion
            const timezoneResult = await this._applyTimezoneConversion(
                baseTime,
                countryCode,
                components.timezoneEngine,
                calculationId
            );

            if (!timezoneResult.success) {
                throw new Error(`Timezone conversion failed: ${timezoneResult.error}`);
            }

            // Step 3: Time window processing
            const timeWindowResult = await this._processTimeWindows(
                timezoneResult.convertedTime,
                timeWindows,
                calculationId
            );

            if (!timeWindowResult.success) {
                throw new Error(`Time window processing failed: ${timeWindowResult.error}`);
            }

            // Step 4: Weekend exclusion
            const weekendResult = await this._applyWeekendExclusion(
                timeWindowResult.targetDateTime,
                activityConfig.skipWeekends,
                calculationId
            );

            if (!weekendResult.success) {
                throw new Error(`Weekend exclusion failed: ${weekendResult.error}`);
            }

            // Step 5: Holiday exclusion
            const holidayResult = await this._applyHolidayExclusion(
                weekendResult.adjustedDateTime,
                countryCode,
                activityConfig.skipHolidays,
                components.holidayChecker,
                calculationId
            );

            if (!holidayResult.success) {
                throw new Error(`Holiday exclusion failed: ${holidayResult.error}`);
            }

            // Step 6: Final validation and future time enforcement
            const finalResult = await this._finalizeSendTime(
                holidayResult.finalDateTime,
                timeWindows,
                calculationId
            );

            if (!finalResult.success) {
                throw new Error(`Final validation failed: ${finalResult.error}`);
            }

            // Compile complete result
            const calculationTime = Date.now() - startTime;
            const result = this._compileCalculationResult(
                contact,
                baseTime,
                finalResult.finalDateTime,
                {
                    timezone: timezoneResult,
                    timeWindow: timeWindowResult,
                    weekend: weekendResult,
                    holiday: holidayResult,
                    final: finalResult
                },
                calculationTime,
                calculationId
            );

            this.logger.info(`Send time calculation completed [${calculationId}]`, {
                subscriberKey: contact.subscriberKey,
                originalTime: baseTime.toISOString(),
                finalTime: result.optimalSendTime.toISOString(),
                calculationTime: `${calculationTime}ms`,
                adjustments: result.adjustments.length
            });

            return result;

        } catch (error) {
            const calculationTime = Date.now() - startTime;
            
            this.logger.error(`Send time calculation failed [${calculationId}]`, {
                subscriberKey: contact?.subscriberKey,
                error: error.message,
                calculationTime: `${calculationTime}ms`
            });

            return {
                success: false,
                calculationId,
                error: error.message,
                subscriberKey: contact?.subscriberKey,
                originalTime: contact?.entryTime ? new Date(contact.entryTime) : new Date(),
                optimalSendTime: null,
                adjustments: [],
                calculationTime,
                workflow: {
                    timezone: { success: false },
                    timeWindow: { success: false },
                    weekend: { success: false },
                    holiday: { success: false },
                    final: { success: false }
                }
            };
        }
    }

    /**
     * Initialize base time for calculation
     * @private
     */
    _initializeBaseTime(contact, options) {
        let baseTime;

        if (contact.entryTime) {
            baseTime = new Date(contact.entryTime);
        } else if (options.baseTime) {
            baseTime = new Date(options.baseTime);
        } else {
            baseTime = new Date();
        }

        // Ensure base time is valid
        if (isNaN(baseTime.getTime())) {
            this.logger.warn('Invalid base time provided, using current time');
            baseTime = new Date();
        }

        return baseTime;
    }

    /**
     * Normalize time windows configuration
     * @private
     */
    _normalizeTimeWindows(timeWindows) {
        if (!timeWindows || !Array.isArray(timeWindows) || timeWindows.length === 0) {
            this.logger.debug('No time windows provided, using defaults');
            return this.config.defaultTimeWindows;
        }

        // Filter enabled time windows and sort by start hour
        const enabledWindows = timeWindows
            .filter(window => window.enabled !== false)
            .sort((a, b) => a.startHour - b.startHour);

        if (enabledWindows.length === 0) {
            this.logger.warn('No enabled time windows found, using defaults');
            return this.config.defaultTimeWindows;
        }

        return enabledWindows;
    }

    /**
     * Apply timezone conversion
     * @private
     */
    async _applyTimezoneConversion(baseTime, countryCode, timezoneEngine, calculationId) {
        try {
            // Get timezone information
            const timezoneInfo = timezoneEngine.getTimezoneInfo(countryCode, {
                calculationId,
                endpoint: 'send-time-calculation'
            });

            // Convert to SFMC time (CST/UTC-6)
            const conversionResult = timezoneEngine.convertToSFMCTime(
                baseTime,
                timezoneInfo.countryCode,
                { calculationId }
            );

            if (!conversionResult.success) {
                return {
                    success: false,
                    error: conversionResult.error
                };
            }

            return {
                success: true,
                originalTime: baseTime,
                convertedTime: conversionResult.sfmcTime,
                countryCode: timezoneInfo.countryCode,
                offsetApplied: conversionResult.offsetFromSFMC,
                timezoneInfo: timezoneInfo.timezone,
                fallbackUsed: timezoneInfo.validation.fallbackUsed
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Process time windows to find optimal slot
     * @private
     */
    async _processTimeWindows(targetDateTime, timeWindows, calculationId) {
        try {
            const targetDate = new Date(targetDateTime);
            const targetHour = targetDate.getHours();
            const targetMinute = targetDate.getMinutes();

            this.logger.debug(`Processing time windows [${calculationId}]`, {
                targetTime: `${targetHour}:${targetMinute.toString().padStart(2, '0')}`,
                availableWindows: timeWindows.length
            });

            // Find the best matching time window
            let selectedWindow = null;
            let selectedDateTime = null;

            // First, try to find a window that contains the current time
            for (const window of timeWindows) {
                if (targetHour >= window.startHour && targetHour < window.endHour) {
                    selectedWindow = window;
                    selectedDateTime = new Date(targetDate);
                    break;
                }
            }

            // If no window contains current time, find the next available window
            if (!selectedWindow) {
                for (const window of timeWindows) {
                    if (targetHour < window.startHour) {
                        selectedWindow = window;
                        selectedDateTime = new Date(targetDate);
                        selectedDateTime.setHours(window.startHour, 0, 0, 0);
                        break;
                    }
                }
            }

            // If still no window (current time is after all windows), use first window of next day
            if (!selectedWindow) {
                selectedWindow = timeWindows[0];
                selectedDateTime = new Date(targetDate);
                selectedDateTime.setDate(selectedDateTime.getDate() + 1);
                selectedDateTime.setHours(selectedWindow.startHour, 0, 0, 0);
            }

            return {
                success: true,
                originalDateTime: targetDateTime,
                targetDateTime: selectedDateTime,
                selectedWindow: selectedWindow,
                windowAdjusted: selectedDateTime.getTime() !== targetDateTime.getTime()
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply weekend exclusion logic
     * @private
     */
    async _applyWeekendExclusion(targetDateTime, skipWeekends, calculationId) {
        try {
            const targetDate = new Date(targetDateTime);
            let adjustedDate = new Date(targetDate);
            let daysAdjusted = 0;
            let adjustmentReason = null;

            if (skipWeekends) {
                // Check if target date is weekend (Saturday = 6, Sunday = 0)
                const dayOfWeek = adjustedDate.getDay();
                
                if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
                    // Move to next Monday
                    const daysToAdd = dayOfWeek === 0 ? 1 : 2; // Sunday: +1, Saturday: +2
                    adjustedDate.setDate(adjustedDate.getDate() + daysToAdd);
                    daysAdjusted = daysToAdd;
                    adjustmentReason = `Moved from ${dayOfWeek === 0 ? 'Sunday' : 'Saturday'} to Monday`;

                    this.logger.debug(`Weekend exclusion applied [${calculationId}]`, {
                        originalDate: targetDate.toISOString().split('T')[0],
                        adjustedDate: adjustedDate.toISOString().split('T')[0],
                        daysAdjusted,
                        reason: adjustmentReason
                    });
                }
            }

            return {
                success: true,
                originalDateTime: targetDateTime,
                adjustedDateTime: adjustedDate,
                daysAdjusted,
                adjustmentReason,
                weekendExclusionApplied: daysAdjusted > 0
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply holiday exclusion logic
     * @private
     */
    async _applyHolidayExclusion(targetDateTime, countryCode, skipHolidays, holidayChecker, calculationId) {
        try {
            const targetDate = new Date(targetDateTime);
            let adjustedDate = new Date(targetDate);
            let daysAdjusted = 0;
            let adjustmentReason = null;
            let holidaysChecked = [];

            if (skipHolidays && holidayChecker) {
                let checkDate = new Date(adjustedDate);
                let maxIterations = this.config.maxLookAheadDays;
                let iterations = 0;

                while (iterations < maxIterations) {
                    const isHoliday = await holidayChecker.isPublicHoliday(checkDate, countryCode);
                    
                    if (isHoliday.isHoliday) {
                        holidaysChecked.push({
                            date: checkDate.toISOString().split('T')[0],
                            name: isHoliday.holidayName
                        });

                        // Move to next day
                        checkDate.setDate(checkDate.getDate() + 1);
                        daysAdjusted++;
                        
                        // Skip weekends if they're also excluded
                        const dayOfWeek = checkDate.getDay();
                        if ((dayOfWeek === 0 || dayOfWeek === 6)) {
                            const weekendDays = dayOfWeek === 0 ? 1 : 2;
                            checkDate.setDate(checkDate.getDate() + weekendDays);
                            daysAdjusted += weekendDays;
                        }
                    } else {
                        break;
                    }

                    iterations++;
                }

                if (daysAdjusted > 0) {
                    adjustedDate = checkDate;
                    adjustmentReason = `Moved ${daysAdjusted} days to avoid ${holidaysChecked.length} holiday(s)`;

                    this.logger.debug(`Holiday exclusion applied [${calculationId}]`, {
                        originalDate: targetDate.toISOString().split('T')[0],
                        adjustedDate: adjustedDate.toISOString().split('T')[0],
                        daysAdjusted,
                        holidaysAvoided: holidaysChecked.length,
                        countryCode
                    });
                }
            }

            return {
                success: true,
                originalDateTime: targetDateTime,
                finalDateTime: adjustedDate,
                daysAdjusted,
                adjustmentReason,
                holidayExclusionApplied: daysAdjusted > 0,
                holidaysChecked
            };

        } catch (error) {
            // If holiday checking fails, continue without holiday exclusion
            this.logger.warn(`Holiday exclusion failed, continuing without [${calculationId}]`, {
                error: error.message,
                countryCode
            });

            return {
                success: true,
                originalDateTime: targetDateTime,
                finalDateTime: new Date(targetDateTime),
                daysAdjusted: 0,
                adjustmentReason: null,
                holidayExclusionApplied: false,
                holidaysChecked: [],
                warning: `Holiday checking failed: ${error.message}`
            };
        }
    }

    /**
     * Finalize send time and ensure it's in the future
     * @private
     */
    async _finalizeSendTime(targetDateTime, timeWindows, calculationId) {
        try {
            const now = new Date();
            const minFutureTime = new Date(now.getTime() + (this.config.minFutureMinutes * 60 * 1000));
            let finalDateTime = new Date(targetDateTime);

            // Ensure the time is in the future
            if (finalDateTime <= minFutureTime) {
                this.logger.debug(`Adjusting time to future [${calculationId}]`, {
                    originalTime: finalDateTime.toISOString(),
                    minFutureTime: minFutureTime.toISOString()
                });

                // Move to next available time slot
                finalDateTime = new Date(minFutureTime);
                
                // Find next available time window
                const targetHour = finalDateTime.getHours();
                let foundWindow = false;

                for (const window of timeWindows) {
                    if (targetHour < window.endHour) {
                        if (targetHour < window.startHour) {
                            finalDateTime.setHours(window.startHour, 0, 0, 0);
                        }
                        foundWindow = true;
                        break;
                    }
                }

                // If no window available today, move to first window tomorrow
                if (!foundWindow) {
                    finalDateTime.setDate(finalDateTime.getDate() + 1);
                    finalDateTime.setHours(timeWindows[0].startHour, 0, 0, 0);
                }
            }

            // Final validation - ensure it's compatible with Wait By Attribute
            const isValidForWaitByAttribute = this._validateWaitByAttributeCompatibility(finalDateTime);
            if (!isValidForWaitByAttribute.isValid) {
                throw new Error(`Wait By Attribute compatibility check failed: ${isValidForWaitByAttribute.error}`);
            }

            return {
                success: true,
                originalDateTime: targetDateTime,
                finalDateTime: finalDateTime,
                futureAdjustmentApplied: finalDateTime.getTime() !== targetDateTime.getTime(),
                waitByAttributeCompatible: true
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate compatibility with Wait By Attribute activity
     * @private
     */
    _validateWaitByAttributeCompatibility(dateTime) {
        try {
            // Check if date is valid
            if (isNaN(dateTime.getTime())) {
                return {
                    isValid: false,
                    error: 'Invalid date/time value'
                };
            }

            // Check if date is in the future
            const now = new Date();
            if (dateTime <= now) {
                return {
                    isValid: false,
                    error: 'Date/time must be in the future'
                };
            }

            // Check if date is not too far in the future (reasonable limit)
            const maxFutureDate = new Date();
            maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);
            if (dateTime > maxFutureDate) {
                return {
                    isValid: false,
                    error: 'Date/time is too far in the future'
                };
            }

            return {
                isValid: true,
                validatedDateTime: dateTime
            };

        } catch (error) {
            return {
                isValid: false,
                error: error.message
            };
        }
    }

    /**
     * Compile complete calculation result
     * @private
     */
    _compileCalculationResult(contact, originalTime, finalDateTime, workflowResults, calculationTime, calculationId) {
        const adjustments = [];

        // Add timezone adjustments
        if (workflowResults.timezone.fallbackUsed) {
            adjustments.push({
                type: 'timezone_fallback',
                reason: 'Country code not found, using fallback timezone',
                originalCountry: contact.geosegment,
                effectiveCountry: workflowResults.timezone.countryCode
            });
        }

        if (workflowResults.timezone.offsetApplied !== 0) {
            adjustments.push({
                type: 'timezone_conversion',
                offsetHours: workflowResults.timezone.offsetApplied,
                originalTime: workflowResults.timezone.originalTime,
                convertedTime: workflowResults.timezone.convertedTime
            });
        }

        // Add time window adjustments
        if (workflowResults.timeWindow.windowAdjusted) {
            adjustments.push({
                type: 'time_window_adjustment',
                selectedWindow: workflowResults.timeWindow.selectedWindow,
                originalTime: workflowResults.timeWindow.originalDateTime,
                adjustedTime: workflowResults.timeWindow.targetDateTime
            });
        }

        // Add weekend adjustments
        if (workflowResults.weekend.weekendExclusionApplied) {
            adjustments.push({
                type: 'weekend_exclusion',
                daysAdjusted: workflowResults.weekend.daysAdjusted,
                reason: workflowResults.weekend.adjustmentReason,
                originalDate: workflowResults.weekend.originalDateTime,
                adjustedDate: workflowResults.weekend.adjustedDateTime
            });
        }

        // Add holiday adjustments
        if (workflowResults.holiday.holidayExclusionApplied) {
            adjustments.push({
                type: 'holiday_exclusion',
                daysAdjusted: workflowResults.holiday.daysAdjusted,
                reason: workflowResults.holiday.adjustmentReason,
                holidaysAvoided: workflowResults.holiday.holidaysChecked,
                originalDate: workflowResults.holiday.originalDateTime,
                adjustedDate: workflowResults.holiday.finalDateTime
            });
        }

        // Add future time adjustments
        if (workflowResults.final.futureAdjustmentApplied) {
            adjustments.push({
                type: 'future_time_adjustment',
                reason: 'Adjusted to ensure time is in the future',
                originalTime: workflowResults.final.originalDateTime,
                adjustedTime: workflowResults.final.finalDateTime
            });
        }

        return {
            success: true,
            calculationId,
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment,
            originalTime: originalTime,
            optimalSendTime: finalDateTime,
            adjustments,
            calculationTime,
            workflow: {
                timezone: {
                    success: workflowResults.timezone.success,
                    countryCode: workflowResults.timezone.countryCode,
                    offsetApplied: workflowResults.timezone.offsetApplied
                },
                timeWindow: {
                    success: workflowResults.timeWindow.success,
                    selectedWindow: workflowResults.timeWindow.selectedWindow
                },
                weekend: {
                    success: workflowResults.weekend.success,
                    exclusionApplied: workflowResults.weekend.weekendExclusionApplied
                },
                holiday: {
                    success: workflowResults.holiday.success,
                    exclusionApplied: workflowResults.holiday.holidayExclusionApplied,
                    holidaysChecked: workflowResults.holiday.holidaysChecked?.length || 0
                },
                final: {
                    success: workflowResults.final.success,
                    waitByAttributeCompatible: workflowResults.final.waitByAttributeCompatible
                }
            },
            validation: {
                waitByAttributeCompatible: workflowResults.final.waitByAttributeCompatible,
                futureTime: finalDateTime > new Date(),
                validDateTime: !isNaN(finalDateTime.getTime())
            }
        };
    }

    /**
     * Generate unique calculation ID for tracking
     * @private
     */
    _generateCalculationId() {
        return `calc_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    /**
     * Get calculator statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        return {
            config: {
                defaultTimezone: this.config.defaultTimezone,
                maxLookAheadDays: this.config.maxLookAheadDays,
                minFutureMinutes: this.config.minFutureMinutes,
                defaultTimeWindowsCount: this.config.defaultTimeWindows.length
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = SendTimeCalculator;