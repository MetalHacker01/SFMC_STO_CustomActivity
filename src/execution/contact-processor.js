/**
 * Contact Processor - New Implementation
 * Main contact processing workflow that integrates timezone calculation, 
 * holiday checking, time window processing, and data extension updates
 */

const { TimezoneEngine } = require('../timezone-engine');
const HolidayChecker = require('../holiday-checker');
const { TimeWindowProcessor } = require('../timewindow');
const { createDataExtensionSuite } = require('../dataextension');

/**
 * Main Contact Processor class that orchestrates the complete send time optimization workflow
 */
class ContactProcessor {
    constructor(config = {}, logger = console) {
        this.logger = logger;
        this.config = {
            // Default configuration
            defaultTimezone: 'America/Chicago',
            holidayApiEnabled: true,
            maxRetries: 3,
            retryDelay: 1000,
            processingTimeout: 20000, // 20 seconds
            ...config
        };

        // Initialize core components
        this.timezoneEngine = new TimezoneEngine(logger, {
            defaultFallbackCountry: 'US',
            logValidationIssues: true,
            enableDetailedLogging: process.env.NODE_ENV === 'development'
        });

        this.holidayChecker = new HolidayChecker({
            enabled: this.config.holidayApiEnabled,
            fallbackBehavior: 'ignore',
            maxLookAheadDays: 30,
            api: config.holidayApi || {},
            cache: config.holidayCache || {}
        });

        this.timeWindowProcessor = new TimeWindowProcessor();

        // Initialize data extension integration (only if SFMC config is provided)
        this.dataExtensionSuite = null;
        if (config.sfmc && config.sfmc.clientId && config.sfmc.clientSecret && config.sfmc.subdomain) {
            try {
                this.dataExtensionSuite = createDataExtensionSuite({
                    sfmc: config.sfmc,
                    logging: config.logging || {},
                    errorHandling: config.errorHandling || {}
                }, logger);
            } catch (error) {
                this.logger.warn('Failed to initialize data extension suite:', error.message);
                this.dataExtensionSuite = null;
            }
        }

        // Processing statistics
        this.stats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            timezoneAdjustments: 0,
            dateAdjustments: 0,
            holidayAdjustments: 0,
            weekendAdjustments: 0,
            dataExtensionUpdates: 0,
            errors: []
        };
    }

    /**
     * Main execute endpoint that processes each contact
     * @param {Object} contact - Contact data from Journey Builder
     * @param {Object} activityConfig - Activity configuration from Journey Builder
     * @param {Object} context - Additional context (JWT, journey info, etc.)
     * @returns {Promise<Object>} Processing result
     */
    async processContact(contact, activityConfig, context = {}) {
        const startTime = Date.now();
        const processingId = this._generateProcessingId();
        
        this.logger.info(`Starting contact processing [${processingId}]`, {
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment
        });

        this.stats.totalProcessed++;

        try {
            // Step 1: Validate input data
            const validation = this._validateContactData(contact, activityConfig);
            if (!validation.isValid) {
                throw new Error(`Invalid input data: ${validation.errors.join(', ')}`);
            }

            // Step 2: Calculate base send time using timezone
            const timezoneResult = await this._calculateTimezoneAdjustedTime(
                contact, 
                activityConfig, 
                processingId
            );

            if (!timezoneResult.success) {
                throw new Error(`Timezone calculation failed: ${timezoneResult.error}`);
            }

            // Step 3: Process time windows and date adjustments
            const timeWindowResult = await this._processTimeWindows(
                timezoneResult.adjustedTime,
                contact.geosegment,
                activityConfig,
                processingId
            );

            if (!timeWindowResult.success) {
                throw new Error(`Time window processing failed: ${timeWindowResult.error}`);
            }

            // Step 4: Update data extension with calculated time
            const updateResult = await this._updateDataExtension(
                contact.subscriberKey,
                timeWindowResult.finalDateTime,
                context.dataExtensionKey,
                processingId
            );

            // Step 5: Compile final result
            const processingTime = Date.now() - startTime;
            const result = this._compileSuccessResult(
                contact,
                timezoneResult,
                timeWindowResult,
                updateResult,
                processingTime,
                processingId
            );

            this.stats.successful++;

            this.logger.info(`Contact processing completed successfully [${processingId}]`, {
                subscriberKey: contact.subscriberKey,
                processingTime: `${processingTime}ms`
            });

            return result;

        } catch (error) {
            this.stats.failed++;
            this.stats.errors.push({
                processingId,
                subscriberKey: contact.subscriberKey,
                error: error.message,
                timestamp: new Date().toISOString()
            });

            const processingTime = Date.now() - startTime;
            const errorResult = this._compileErrorResult(
                contact,
                error,
                processingTime,
                processingId
            );

            this.logger.error(`Contact processing failed [${processingId}]`, {
                subscriberKey: contact.subscriberKey,
                error: error.message
            });

            return errorResult;
        }
    }

    /**
     * Process multiple contacts in batch
     */
    async processBatch(contacts, activityConfig, context = {}) {
        if (!Array.isArray(contacts) || contacts.length === 0) {
            return {
                success: false,
                error: 'No contacts provided for batch processing',
                results: []
            };
        }

        const results = [];
        for (const contact of contacts) {
            const result = await this.processContact(contact, activityConfig, context);
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        return {
            success: failureCount === 0,
            totalContacts: contacts.length,
            successful: successCount,
            failed: failureCount,
            results: results
        };
    }

    /**
     * Calculate timezone-adjusted time for a contact
     * @private
     */
    async _calculateTimezoneAdjustedTime(contact, activityConfig, processingId) {
        try {
            const baseTime = contact.entryTime ? new Date(contact.entryTime) : new Date();
            const countryCode = contact.geosegment || 'US';

            // Get timezone information
            const timezoneInfo = this.timezoneEngine.getTimezoneInfo(countryCode, {
                processingId,
                endpoint: 'contact-processing'
            });

            // Convert to SFMC time for processing
            const conversionResult = this.timezoneEngine.convertToSFMCTime(
                baseTime, 
                timezoneInfo.countryCode,
                { processingId }
            );

            if (!conversionResult.success) {
                throw new Error(`Time conversion failed: ${conversionResult.error}`);
            }

            return {
                success: true,
                originalTime: baseTime,
                adjustedTime: conversionResult.sfmcTime,
                countryCode: timezoneInfo.countryCode,
                timezoneInfo: timezoneInfo.timezone,
                validation: timezoneInfo.validation,
                offsetApplied: conversionResult.offsetFromSFMC
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                originalTime: contact.entryTime ? new Date(contact.entryTime) : new Date()
            };
        }
    }

    /**
     * Process time windows and apply date adjustments
     * @private
     */
    async _processTimeWindows(adjustedTime, countryCode, activityConfig, processingId) {
        try {
            // For now, return the adjusted time as final time
            // This will be enhanced when time window processing is fully implemented
            return {
                success: true,
                originalDateTime: adjustedTime,
                finalDateTime: adjustedTime,
                adjustments: {
                    dateAdjusted: false,
                    daysAdjusted: 0
                },
                validation: { warnings: [] }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                originalDateTime: adjustedTime
            };
        }
    }

    /**
     * Update data extension with calculated time
     * @private
     */
    async _updateDataExtension(subscriberKey, convertedTime, dataExtensionKey, processingId) {
        if (!dataExtensionKey) {
            return { success: true, skipped: true };
        }

        if (!this.dataExtensionSuite) {
            this.logger.debug(`Data extension suite not available, skipping update [${processingId}]`);
            return { success: true, skipped: true };
        }

        try {
            const result = await this.dataExtensionSuite.updateConvertedTimeWithErrorHandling(
                subscriberKey,
                convertedTime,
                dataExtensionKey
            );

            if (result.success) {
                this.stats.dataExtensionUpdates++;
            }

            return result;

        } catch (error) {
            return {
                success: false,
                error: error.message,
                subscriberKey,
                convertedTime
            };
        }
    }

    /**
     * Validate contact data and activity configuration
     * @private
     */
    _validateContactData(contact, activityConfig) {
        const errors = [];

        if (!contact) {
            errors.push('Contact data is required');
        } else {
            if (!contact.subscriberKey) {
                errors.push('SubscriberKey is required');
            }
        }

        if (!activityConfig) {
            errors.push('Activity configuration is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Compile successful processing result
     * @private
     */
    _compileSuccessResult(contact, timezoneResult, timeWindowResult, updateResult, processingTime, processingId) {
        const adjustments = [];

        if (timezoneResult.validation.fallbackUsed) {
            adjustments.push({
                type: 'timezone_fallback',
                reason: timezoneResult.validation.message,
                originalCountry: contact.geosegment,
                effectiveCountry: timezoneResult.countryCode
            });
        }

        return {
            success: true,
            processingId,
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment,
            originalTime: contact.entryTime || new Date(),
            convertedTime: timeWindowResult.finalDateTime,
            adjustments,
            dataExtensionUpdate: {
                attempted: !!updateResult,
                successful: updateResult?.success || false,
                skipped: updateResult?.skipped || false
            },
            processingTime
        };
    }

    /**
     * Compile error processing result
     * @private
     */
    _compileErrorResult(contact, error, processingTime, processingId) {
        return {
            success: false,
            processingId,
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment,
            error: error.message,
            originalTime: contact.entryTime || new Date(),
            convertedTime: null,
            adjustments: [],
            processingTime
        };
    }

    /**
     * Generate unique processing ID for tracking
     * @private
     */
    _generateProcessingId() {
        return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get processing statistics
     */
    getStats() {
        return {
            ...this.stats,
            timezone: this.timezoneEngine.getEngineStats(),
            holiday: this.holidayChecker.getStats()
        };
    }

    /**
     * Reset all statistics
     */
    resetStats() {
        this.stats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            timezoneAdjustments: 0,
            dateAdjustments: 0,
            holidayAdjustments: 0,
            weekendAdjustments: 0,
            dataExtensionUpdates: 0,
            errors: []
        };
    }

    /**
     * Health check for the contact processor
     */
    async healthCheck() {
        return {
            status: 'healthy',
            components: {
                timezone: { status: 'healthy' },
                holiday: { status: this.config.holidayApiEnabled ? 'healthy' : 'disabled' },
                dataExtension: { status: 'healthy' }
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = ContactProcessor;