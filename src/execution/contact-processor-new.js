/**
 * Contact Processor - New Implementation
 * Main contact processing workflow that integrates timezone calculation, 
 * holiday checking, time window processing, and data extension updates
 */

const { TimezoneEngine } = require('../timezone-engine');
const HolidayChecker = require('../holiday-checker');
const { TimeWindowProcessor } = require('../timewindow');
const { createDataExtensionSuite } = require('../dataextension');
const SendTimeCalculator = require('./send-time-calculator');
const ExecutionLogger = require('./execution-logger');
const PerformanceMonitor = require('./performance-monitor');

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

        // Initialize send time calculator
        this.sendTimeCalculator = new SendTimeCalculator({
            defaultTimezone: this.config.defaultTimezone,
            maxLookAheadDays: 30,
            minFutureMinutes: 5
        }, logger);

        // Initialize execution logger
        this.executionLogger = new ExecutionLogger(logger, {
            logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
            enablePerformanceLogging: true,
            enableStatisticsTracking: true
        });

        // Initialize performance monitor
        this.performanceMonitor = new PerformanceMonitor({
            enableResourceMonitoring: true,
            slowProcessingThreshold: 5000,
            verySlowProcessingThreshold: 10000
        }, logger);

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
        
        // Start comprehensive logging and monitoring
        this.executionLogger.logProcessingStart(processingId, contact, activityConfig, context);
        this.performanceMonitor.recordProcessingStart(processingId, {
            geosegment: contact.geosegment,
            timeWindowsCount: activityConfig.timeWindows?.length || 0
        });

        this.stats.totalProcessed++;

        try {
            // Step 1: Validate input data
            const validation = this._validateContactData(contact, activityConfig);
            if (!validation.isValid) {
                throw new Error(`Invalid input data: ${validation.errors.join(', ')}`);
            }

            // Step 2: Calculate optimal send time using the comprehensive algorithm
            const calculationResult = await this._calculateOptimalSendTime(
                contact,
                activityConfig,
                processingId
            );

            if (!calculationResult.success) {
                throw new Error(`Send time calculation failed: ${calculationResult.error}`);
            }

            // Step 3: Update data extension with calculated time
            const updateResult = await this._updateDataExtension(
                contact.subscriberKey,
                calculationResult.optimalSendTime,
                context.dataExtensionKey,
                processingId
            );

            // Step 4: Compile final result
            const processingTime = Date.now() - startTime;
            const result = this._compileSuccessResult(
                contact,
                calculationResult,
                updateResult,
                processingTime,
                processingId
            );

            this.stats.successful++;

            // Log successful completion
            this.executionLogger.logProcessingComplete(processingId, result);
            this.performanceMonitor.recordProcessingComplete(processingId, true, result);

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

            // Log error completion
            this.executionLogger.logProcessingComplete(processingId, errorResult);
            this.performanceMonitor.recordProcessingComplete(processingId, false, errorResult);
            this.performanceMonitor.recordError(processingId, 'processing_error', error.message);

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
     * Calculate optimal send time using the comprehensive algorithm
     * Handles the complete workflow: timezone → time windows → weekend exclusion → holiday exclusion
     * @private
     */
    async _calculateOptimalSendTime(contact, activityConfig, processingId) {
        try {
            // Start timing for send time calculation
            this.executionLogger.startStepTimer(processingId, 'send_time_calculation');
            
            // Prepare components for the calculation
            const components = {
                timezoneEngine: this.timezoneEngine,
                holidayChecker: this.holidayChecker,
                timeWindowProcessor: this.timeWindowProcessor
            };

            // Execute the comprehensive send time calculation algorithm
            const result = await this.sendTimeCalculator.calculateOptimalSendTime(
                contact,
                activityConfig,
                components,
                { processingId }
            );

            // End timing and record performance
            const calculationTime = this.executionLogger.endStepTimer(processingId, 'send_time_calculation');
            this.performanceMonitor.recordStepTiming(processingId, 'send_time_calculation', calculationTime, result.success);

            if (!result.success) {
                this.executionLogger.logError(processingId, result.error, {
                    step: 'send_time_calculation',
                    subscriberKey: contact.subscriberKey,
                    geosegment: contact.geosegment
                });
                throw new Error(result.error);
            }

            // Log detailed calculation results
            this._logCalculationDetails(processingId, result);

            // Update statistics based on adjustments
            this._updateAdjustmentStats(result.adjustments);

            return result;

        } catch (error) {
            this.executionLogger.logError(processingId, error, {
                step: 'send_time_calculation',
                subscriberKey: contact.subscriberKey
            });

            return {
                success: false,
                error: error.message,
                subscriberKey: contact.subscriberKey,
                originalTime: contact.entryTime ? new Date(contact.entryTime) : new Date(),
                optimalSendTime: null,
                adjustments: []
            };
        }
    }

    /**
     * Log detailed calculation results
     * @private
     */
    _logCalculationDetails(processingId, result) {
        // Log timezone calculation details
        if (result.workflow.timezone) {
            this.executionLogger.logTimezoneCalculation(processingId, result.geosegment, {
                success: result.workflow.timezone.success,
                offsetApplied: result.workflow.timezone.offsetApplied,
                fallbackUsed: result.adjustments.some(adj => adj.type === 'timezone_fallback')
            });
        }

        // Log holiday checking details
        if (result.workflow.holiday) {
            this.executionLogger.logHolidayCheck(processingId, result.geosegment, {
                holidaysChecked: result.workflow.holiday.holidaysChecked || 0,
                holidayExclusionApplied: result.workflow.holiday.exclusionApplied,
                daysAdjusted: result.adjustments
                    .filter(adj => adj.type === 'holiday_exclusion')
                    .reduce((sum, adj) => sum + (adj.daysAdjusted || 0), 0)
            });
        }

        // Log time window processing details
        if (result.workflow.timeWindow) {
            this.executionLogger.logTimeWindowProcessing(processingId, [], {
                success: result.workflow.timeWindow.success,
                selectedWindow: result.workflow.timeWindow.selectedWindow,
                windowAdjusted: result.adjustments.some(adj => adj.type === 'time_window_adjustment')
            });
        }
    }

    /**
     * Update adjustment statistics based on calculation result
     * @private
     */
    _updateAdjustmentStats(adjustments) {
        adjustments.forEach(adjustment => {
            switch (adjustment.type) {
                case 'timezone_fallback':
                case 'timezone_conversion':
                    this.stats.timezoneAdjustments++;
                    break;
                case 'time_window_adjustment':
                    this.stats.dateAdjustments++;
                    break;
                case 'weekend_exclusion':
                    this.stats.weekendAdjustments++;
                    this.stats.dateAdjustments++;
                    break;
                case 'holiday_exclusion':
                    this.stats.holidayAdjustments++;
                    this.stats.dateAdjustments++;
                    break;
                case 'future_time_adjustment':
                    this.stats.dateAdjustments++;
                    break;
            }
        });
    }

    /**
     * Update data extension with calculated time
     * @private
     */
    async _updateDataExtension(subscriberKey, convertedTime, dataExtensionKey, processingId) {
        if (!dataExtensionKey) {
            const result = { success: true, skipped: true };
            this.executionLogger.logDataExtensionUpdate(processingId, subscriberKey, result);
            return result;
        }

        if (!this.dataExtensionSuite) {
            const result = { success: true, skipped: true };
            this.executionLogger.logDataExtensionUpdate(processingId, subscriberKey, result);
            return result;
        }

        try {
            // Start timing for data extension update
            this.executionLogger.startStepTimer(processingId, 'data_extension_update');
            
            const result = await this.dataExtensionSuite.updateConvertedTimeWithErrorHandling(
                subscriberKey,
                convertedTime,
                dataExtensionKey
            );

            // End timing and record performance
            const updateTime = this.executionLogger.endStepTimer(processingId, 'data_extension_update');
            this.performanceMonitor.recordStepTiming(processingId, 'data_extension_update', updateTime, result.success);

            // Log the update result
            this.executionLogger.logDataExtensionUpdate(processingId, subscriberKey, result);

            if (result.success) {
                this.stats.dataExtensionUpdates++;
            } else {
                this.performanceMonitor.recordError(processingId, 'data_extension_error', result.error);
            }

            return result;

        } catch (error) {
            const result = {
                success: false,
                error: error.message,
                subscriberKey,
                convertedTime
            };

            this.executionLogger.logDataExtensionUpdate(processingId, subscriberKey, result);
            this.performanceMonitor.recordError(processingId, 'data_extension_error', error.message);

            return result;
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
    _compileSuccessResult(contact, calculationResult, updateResult, processingTime, processingId) {
        return {
            success: true,
            processingId,
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment,
            originalTime: calculationResult.originalTime,
            convertedTime: calculationResult.optimalSendTime,
            adjustments: calculationResult.adjustments,
            dataExtensionUpdate: {
                attempted: !!updateResult,
                successful: updateResult?.success || false,
                skipped: updateResult?.skipped || false
            },
            processingTime,
            calculationTime: calculationResult.calculationTime,
            workflow: calculationResult.workflow,
            validation: calculationResult.validation
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
            holiday: this.holidayChecker.getStats(),
            execution: this.executionLogger.getExecutionStats(),
            performance: this.performanceMonitor.getPerformanceStats(),
            calculator: this.sendTimeCalculator.getStats()
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

        // Reset logging and monitoring
        this.executionLogger.reset();
        this.performanceMonitor.reset();
    }

    /**
     * Clean up resources and stop monitoring
     */
    cleanup() {
        if (this.performanceMonitor) {
            this.performanceMonitor.stopResourceMonitoring();
        }

        this.logger.info('Contact processor cleanup completed');
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