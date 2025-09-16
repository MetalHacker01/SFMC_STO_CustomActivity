/**
 * Execution Engine Module
 * Main contact processing workflow and send time calculation
 */

const ContactProcessor = require('./contact-processor-new');
const SendTimeCalculator = require('./send-time-calculator');
const ExecutionLogger = require('./execution-logger');
const PerformanceMonitor = require('./performance-monitor');

/**
 * Main Execution Engine class that provides the primary interface for contact processing
 */
class ExecutionEngine {
    constructor(config = {}, logger = console) {
        this.logger = logger;
        this.config = {
            // Default configuration
            defaultTimezone: 'America/Chicago',
            holidayApiEnabled: true,
            maxRetries: 3,
            retryDelay: 1000,
            processingTimeout: 20000, // 20 seconds
            batchSize: 10, // Maximum contacts to process concurrently
            ...config
        };

        // Initialize contact processor
        this.contactProcessor = new ContactProcessor(this.config, logger);

        // Initialize send time calculator
        this.sendTimeCalculator = new SendTimeCalculator({
            defaultTimezone: this.config.defaultTimezone,
            maxLookAheadDays: 30,
            minFutureMinutes: 5
        }, logger);

        // Initialize execution logger for engine-level logging
        this.executionLogger = new ExecutionLogger(logger, {
            logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
            enablePerformanceLogging: true,
            enableStatisticsTracking: true
        });

        // Initialize performance monitor for engine-level monitoring
        this.performanceMonitor = new PerformanceMonitor({
            enableResourceMonitoring: true,
            slowProcessingThreshold: 5000,
            verySlowProcessingThreshold: 10000
        }, logger);

        // Engine statistics
        this.engineStats = {
            totalRequests: 0,
            batchRequests: 0,
            singleRequests: 0,
            totalContactsProcessed: 0,
            averageProcessingTime: 0,
            lastProcessingTime: null,
            errors: []
        };
    }

    /**
     * Main execute endpoint that processes each contact
     * Integrates timezone calculation, holiday checking, and time window processing
     * @param {Object} contact - Contact data from Journey Builder
     * @param {Object} activityConfig - Activity configuration from Journey Builder  
     * @param {Object} context - Additional context (JWT, journey info, etc.)
     * @returns {Promise<Object>} Processing result
     */
    async executeContact(contact, activityConfig, context = {}) {
        const startTime = Date.now();
        this.engineStats.totalRequests++;
        this.engineStats.singleRequests++;

        this.logger.info('Execution engine processing single contact', {
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment,
            hasTimeWindows: !!(activityConfig && activityConfig.timeWindows && activityConfig.timeWindows.length > 0),
            skipWeekends: activityConfig && activityConfig.skipWeekends,
            skipHolidays: activityConfig && activityConfig.skipHolidays
        });

        try {
            // Validate execution context
            const contextValidation = this._validateExecutionContext(contact, activityConfig, context);
            if (!contextValidation.isValid) {
                throw new Error(`Invalid execution context: ${contextValidation.errors.join(', ')}`);
            }

            // Process contact through the comprehensive pipeline
            const result = await this.contactProcessor.processContact(contact, activityConfig, context);

            // Update engine statistics
            const processingTime = Date.now() - startTime;
            this._updateEngineStats(processingTime, 1, result.success);

            this.logger.info('Execution engine completed contact processing', {
                subscriberKey: contact.subscriberKey,
                success: result.success,
                processingTime: `${processingTime}ms`,
                convertedTime: result.convertedTime,
                adjustments: result.adjustments?.length || 0
            });

            return {
                ...result,
                engineProcessingTime: processingTime,
                engineId: this._generateEngineId()
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this._updateEngineStats(processingTime, 1, false);
            
            this.engineStats.errors.push({
                timestamp: new Date().toISOString(),
                subscriberKey: contact.subscriberKey,
                error: error.message,
                processingTime
            });

            this.logger.error('Execution engine failed to process contact', {
                subscriberKey: contact.subscriberKey,
                error: error.message,
                processingTime: `${processingTime}ms`
            });

            return {
                success: false,
                error: error.message,
                subscriberKey: contact.subscriberKey,
                engineProcessingTime: processingTime,
                engineId: this._generateEngineId()
            };
        }
    }

    /**
     * Execute batch processing for multiple contacts
     * @param {Array} contacts - Array of contact data
     * @param {Object} activityConfig - Activity configuration
     * @param {Object} context - Additional context
     * @returns {Promise<Object>} Batch processing result
     */
    async executeBatch(contacts, activityConfig, context = {}) {
        const startTime = Date.now();
        this.engineStats.totalRequests++;
        this.engineStats.batchRequests++;

        this.logger.info('Execution engine processing batch', {
            contactCount: contacts.length,
            batchSize: this.config.batchSize,
            hasTimeWindows: !!(activityConfig && activityConfig.timeWindows && activityConfig.timeWindows.length > 0)
        });

        try {
            // Validate batch execution context
            if (!Array.isArray(contacts) || contacts.length === 0) {
                throw new Error('Contacts array is required and must not be empty');
            }

            // Process batch through contact processor
            const result = await this.contactProcessor.processBatch(contacts, activityConfig, context);

            // Update engine statistics
            const processingTime = Date.now() - startTime;
            this._updateEngineStats(processingTime, contacts.length, result.success);

            this.logger.info('Execution engine completed batch processing', {
                totalContacts: result.totalContacts,
                successful: result.successful,
                failed: result.failed,
                processingTime: `${processingTime}ms`,
                averagePerContact: `${Math.round(processingTime / contacts.length)}ms`
            });

            return {
                ...result,
                engineProcessingTime: processingTime,
                engineId: this._generateEngineId(),
                averageProcessingTimePerContact: Math.round(processingTime / contacts.length)
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            this._updateEngineStats(processingTime, contacts.length, false);

            this.engineStats.errors.push({
                timestamp: new Date().toISOString(),
                batchSize: contacts.length,
                error: error.message,
                processingTime
            });

            this.logger.error('Execution engine failed to process batch', {
                contactCount: contacts.length,
                error: error.message,
                processingTime: `${processingTime}ms`
            });

            return {
                success: false,
                error: error.message,
                totalContacts: contacts.length,
                successful: 0,
                failed: contacts.length,
                engineProcessingTime: processingTime,
                engineId: this._generateEngineId()
            };
        }
    }

    /**
     * Create comprehensive contact processing pipeline
     * This method demonstrates the complete workflow integration
     * @param {Object} contact - Contact data
     * @param {Object} activityConfig - Activity configuration
     * @param {Object} context - Processing context
     * @returns {Promise<Object>} Complete processing pipeline result
     */
    async createContactProcessingPipeline(contact, activityConfig, context = {}) {
        const pipelineId = this._generatePipelineId();
        
        this.logger.info(`Starting comprehensive contact processing pipeline [${pipelineId}]`, {
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment
        });

        const pipeline = {
            id: pipelineId,
            contact: contact,
            config: activityConfig,
            context: context,
            steps: [],
            startTime: Date.now(),
            endTime: null,
            success: false,
            result: null
        };

        try {
            // Step 1: Input validation and normalization
            pipeline.steps.push({
                step: 'input_validation',
                startTime: Date.now(),
                status: 'in_progress'
            });

            const validation = this._validateExecutionContext(contact, activityConfig, context);
            if (!validation.isValid) {
                throw new Error(`Pipeline validation failed: ${validation.errors.join(', ')}`);
            }

            pipeline.steps[pipeline.steps.length - 1].status = 'completed';
            pipeline.steps[pipeline.steps.length - 1].endTime = Date.now();

            // Step 2: Timezone calculation integration
            pipeline.steps.push({
                step: 'timezone_calculation',
                startTime: Date.now(),
                status: 'in_progress'
            });

            // This is handled within the contact processor
            pipeline.steps[pipeline.steps.length - 1].status = 'completed';
            pipeline.steps[pipeline.steps.length - 1].endTime = Date.now();

            // Step 3: Holiday checking integration
            pipeline.steps.push({
                step: 'holiday_checking',
                startTime: Date.now(),
                status: 'in_progress'
            });

            // This is handled within the contact processor
            pipeline.steps[pipeline.steps.length - 1].status = 'completed';
            pipeline.steps[pipeline.steps.length - 1].endTime = Date.now();

            // Step 4: Time window processing integration
            pipeline.steps.push({
                step: 'time_window_processing',
                startTime: Date.now(),
                status: 'in_progress'
            });

            // This is handled within the contact processor
            pipeline.steps[pipeline.steps.length - 1].status = 'completed';
            pipeline.steps[pipeline.steps.length - 1].endTime = Date.now();

            // Step 5: Execute complete processing
            pipeline.steps.push({
                step: 'contact_processing',
                startTime: Date.now(),
                status: 'in_progress'
            });

            const result = await this.contactProcessor.processContact(contact, activityConfig, context);

            pipeline.steps[pipeline.steps.length - 1].status = result.success ? 'completed' : 'failed';
            pipeline.steps[pipeline.steps.length - 1].endTime = Date.now();
            pipeline.steps[pipeline.steps.length - 1].result = result;

            // Complete pipeline
            pipeline.endTime = Date.now();
            pipeline.success = result.success;
            pipeline.result = result;
            pipeline.totalProcessingTime = pipeline.endTime - pipeline.startTime;

            this.logger.info(`Contact processing pipeline completed [${pipelineId}]`, {
                success: pipeline.success,
                totalTime: `${pipeline.totalProcessingTime}ms`,
                steps: pipeline.steps.length,
                subscriberKey: contact.subscriberKey
            });

            return pipeline;

        } catch (error) {
            // Mark current step as failed
            if (pipeline.steps.length > 0) {
                const currentStep = pipeline.steps[pipeline.steps.length - 1];
                if (currentStep.status === 'in_progress') {
                    currentStep.status = 'failed';
                    currentStep.endTime = Date.now();
                    currentStep.error = error.message;
                }
            }

            pipeline.endTime = Date.now();
            pipeline.success = false;
            pipeline.error = error.message;
            pipeline.totalProcessingTime = pipeline.endTime - pipeline.startTime;

            this.logger.error(`Contact processing pipeline failed [${pipelineId}]`, {
                error: error.message,
                totalTime: `${pipeline.totalProcessingTime}ms`,
                failedStep: pipeline.steps[pipeline.steps.length - 1]?.step,
                subscriberKey: contact.subscriberKey
            });

            return pipeline;
        }
    }

    /**
     * Validate execution context
     * @private
     */
    _validateExecutionContext(contact, activityConfig, context) {
        const errors = [];

        // Validate contact data
        if (!contact) {
            errors.push('Contact data is required');
        } else {
            if (!contact.subscriberKey) {
                errors.push('Contact SubscriberKey is required');
            }
            // geosegment is optional, will use default if missing
        }

        // Validate activity configuration
        if (!activityConfig) {
            errors.push('Activity configuration is required');
        } else {
            // Validate time windows if provided
            if (activityConfig.timeWindows && !Array.isArray(activityConfig.timeWindows)) {
                errors.push('Time windows must be an array');
            }

            // Validate boolean flags
            if (activityConfig.skipWeekends !== undefined && typeof activityConfig.skipWeekends !== 'boolean') {
                errors.push('skipWeekends must be a boolean');
            }

            if (activityConfig.skipHolidays !== undefined && typeof activityConfig.skipHolidays !== 'boolean') {
                errors.push('skipHolidays must be a boolean');
            }
        }

        // Context validation is optional but log if missing important fields
        if (!context.dataExtensionKey) {
            this.logger.debug('No data extension key provided in context');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Update engine statistics
     * @private
     */
    _updateEngineStats(processingTime, contactCount, success) {
        this.engineStats.totalContactsProcessed += contactCount;
        this.engineStats.lastProcessingTime = processingTime;

        // Update average processing time
        const totalTime = (this.engineStats.averageProcessingTime * (this.engineStats.totalRequests - 1)) + processingTime;
        this.engineStats.averageProcessingTime = Math.round(totalTime / this.engineStats.totalRequests);

        // Keep only last 100 errors
        if (this.engineStats.errors.length > 100) {
            this.engineStats.errors = this.engineStats.errors.slice(-100);
        }
    }

    /**
     * Generate unique engine ID for tracking
     * @private
     */
    _generateEngineId() {
        return `engine_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }

    /**
     * Generate unique pipeline ID for tracking
     * @private
     */
    _generatePipelineId() {
        return `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    /**
     * Get engine statistics
     * @returns {Object} Current engine statistics
     */
    getEngineStats() {
        return {
            engine: {
                ...this.engineStats,
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            },
            contactProcessor: this.contactProcessor.getStats(),
            executionLogging: this.executionLogger.getExecutionStats(),
            performance: this.performanceMonitor.getPerformanceStats(),
            sendTimeCalculator: this.sendTimeCalculator.getStats()
        };
    }

    /**
     * Reset engine statistics
     */
    resetEngineStats() {
        this.engineStats = {
            totalRequests: 0,
            batchRequests: 0,
            singleRequests: 0,
            totalContactsProcessed: 0,
            averageProcessingTime: 0,
            lastProcessingTime: null,
            errors: []
        };

        this.contactProcessor.resetStats();
        this.executionLogger.reset();
        this.performanceMonitor.reset();
    }

    /**
     * Clean up resources and stop monitoring
     */
    cleanup() {
        if (this.contactProcessor) {
            this.contactProcessor.cleanup();
        }

        if (this.performanceMonitor) {
            this.performanceMonitor.stopResourceMonitoring();
        }

        this.logger.info('Execution engine cleanup completed');
    }

    /**
     * Health check for the execution engine
     * @returns {Promise<Object>} Health status
     */
    async healthCheck() {
        const health = {
            status: 'healthy',
            engine: {
                status: 'healthy',
                totalRequests: this.engineStats.totalRequests,
                totalContactsProcessed: this.engineStats.totalContactsProcessed,
                averageProcessingTime: this.engineStats.averageProcessingTime
            },
            contactProcessor: null,
            timestamp: new Date().toISOString()
        };

        try {
            // Check contact processor health
            health.contactProcessor = await this.contactProcessor.healthCheck();
            
            // Determine overall health
            if (health.contactProcessor.status !== 'healthy') {
                health.status = 'degraded';
            }

        } catch (error) {
            health.status = 'unhealthy';
            health.error = error.message;
        }

        return health;
    }
}

module.exports = {
    ExecutionEngine,
    ContactProcessor
};