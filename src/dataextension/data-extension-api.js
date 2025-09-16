/**
 * SFMC Data Extension API Client
 * Handles data extension operations with comprehensive error handling and logging
 */

const SFMCAuthService = require('./sfmc-auth');
const DataExtensionErrorHandler = require('./error-handler');
const DataExtensionOperationLogger = require('./operation-logger');

class DataExtensionAPI {
    constructor(config, logger = console) {
        this.authService = new SFMCAuthService(config, logger);
        this.logger = logger;
        this.config = config;
        
        // Initialize comprehensive error handling and logging
        this.errorHandler = new DataExtensionErrorHandler({
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            backoffMultiplier: config.backoffMultiplier || 2,
            maxRetryDelay: config.maxRetryDelay || 30000,
            enableGracefulDegradation: config.enableGracefulDegradation !== false,
            logLevel: config.logLevel || 'info'
        }, logger);

        this.operationLogger = new DataExtensionOperationLogger({
            logLevel: config.logLevel || 'info',
            includeTimestamps: config.includeTimestamps !== false,
            includeContext: config.includeContext !== false,
            maxLogEntries: config.maxLogEntries || 1000,
            enableMetrics: config.enableMetrics !== false
        }, logger);
        
        // Legacy retry configuration for backward compatibility
        this.retryConfig = {
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            backoffMultiplier: config.backoffMultiplier || 2
        };
    }

    /**
     * Updates a single contact's ConvertedTime field in the data extension
     * @param {string} subscriberKey - The subscriber key to update
     * @param {Date} convertedTime - The calculated send time
     * @param {string} dataExtensionKey - The data extension external key
     * @returns {Promise<Object>} Update result
     */
    async updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey) {
        const tracking = this.operationLogger.logOperationStart('updateConvertedTime', {
            subscriberKey,
            dataExtensionKey,
            convertedTime: convertedTime?.toISOString()
        });

        try {
            if (!subscriberKey) {
                throw new Error('SubscriberKey is required for data extension update');
            }

            if (!convertedTime || !(convertedTime instanceof Date)) {
                throw new Error('ConvertedTime must be a valid Date object');
            }

            if (!dataExtensionKey) {
                throw new Error('DataExtensionKey is required for data extension update');
            }

            const updateData = {
                keys: {
                    SubscriberKey: subscriberKey
                },
                values: {
                    ConvertedTime: convertedTime.toISOString(),
                    LastUpdated: new Date().toISOString(),
                    ProcessingStatus: 'Completed'
                }
            };

            // Use error handler for retry logic and graceful degradation
            const result = await this.errorHandler.executeWithRetry(
                () => this.performSingleUpdate(dataExtensionKey, updateData),
                'updateConvertedTime',
                { subscriberKey, dataExtensionKey }
            );

            if (result.success) {
                this.operationLogger.logOperationSuccess(tracking, result, {
                    subscriberKey,
                    attempts: result.attempts
                });

                this.operationLogger.logContactEvent(subscriberKey, 'converted_time_updated', {
                    convertedTime: convertedTime.toISOString(),
                    attempts: result.attempts
                });

                return {
                    success: true,
                    subscriberKey,
                    response: result.result,
                    attempts: result.attempts
                };
            } else {
                this.operationLogger.logOperationFailure(tracking, new Error(result.error), {
                    subscriberKey,
                    attempts: result.attempts,
                    gracefulDegradation: result.gracefulDegradation
                });

                this.operationLogger.logContactEvent(subscriberKey, 'update_failed', {
                    error: result.error,
                    attempts: result.attempts
                });

                return {
                    success: false,
                    subscriberKey,
                    error: result.error,
                    attempts: result.attempts,
                    gracefulDegradation: result.gracefulDegradation
                };
            }

        } catch (error) {
            this.operationLogger.logOperationFailure(tracking, error, { subscriberKey });
            this.operationLogger.logContactEvent(subscriberKey, 'update_failed', {
                error: error.message,
                attempts: 0
            });

            return {
                success: false,
                subscriberKey,
                error: error.message,
                attempts: 0
            };
        }
    }

    /**
     * Updates multiple contacts' ConvertedTime fields in batch
     * @param {Array} updates - Array of update objects with subscriberKey, convertedTime
     * @param {string} dataExtensionKey - The data extension external key
     * @returns {Promise<Object>} Batch update result
     */
    async batchUpdateConvertedTime(updates, dataExtensionKey) {
        const batchKey = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const tracking = this.operationLogger.logOperationStart('batchUpdateConvertedTime', {
            contactCount: updates?.length,
            dataExtensionKey,
            batchKey
        });

        this.operationLogger.logBatchEvent('batch_created', {
            batchKey,
            contactCount: updates?.length
        });

        try {
            if (!Array.isArray(updates) || updates.length === 0) {
                throw new Error('Updates array is required and must not be empty');
            }

            if (!dataExtensionKey) {
                throw new Error('DataExtensionKey is required for batch update');
            }

            // Validate all updates
            for (const update of updates) {
                if (!update.subscriberKey) {
                    throw new Error('All updates must have a subscriberKey');
                }
                if (!update.convertedTime || !(update.convertedTime instanceof Date)) {
                    throw new Error('All updates must have a valid convertedTime Date object');
                }
            }

            // Convert updates to SFMC format
            const batchData = updates.map(update => ({
                keys: {
                    SubscriberKey: update.subscriberKey
                },
                values: {
                    ConvertedTime: update.convertedTime.toISOString(),
                    LastUpdated: new Date().toISOString(),
                    ProcessingStatus: 'Completed'
                }
            }));

            // Use error handler for retry logic and graceful degradation
            const result = await this.errorHandler.executeWithRetry(
                () => this.performBatchUpdate(dataExtensionKey, batchData),
                'batchUpdateConvertedTime',
                { contactCount: updates.length, dataExtensionKey, batchKey }
            );

            if (result.success) {
                this.operationLogger.logOperationSuccess(tracking, result, {
                    contactCount: updates.length,
                    attempts: result.attempts,
                    batchKey
                });

                this.operationLogger.logBatchEvent('batch_processed', {
                    batchKey,
                    contactCount: updates.length,
                    success: true,
                    duration: Date.now() - tracking.startTime
                });

                return {
                    success: true,
                    contactCount: updates.length,
                    response: result.result,
                    attempts: result.attempts,
                    batchKey
                };
            } else {
                this.operationLogger.logOperationFailure(tracking, new Error(result.error), {
                    contactCount: updates.length,
                    attempts: result.attempts,
                    gracefulDegradation: result.gracefulDegradation,
                    batchKey
                });

                this.operationLogger.logBatchEvent('batch_failed', {
                    batchKey,
                    contactCount: updates.length,
                    error: result.error
                });

                // If graceful degradation suggests individual updates, attempt them
                if (result.gracefulDegradation?.fallbackValue === 'individual_updates') {
                    this.logger.info('Attempting individual updates as fallback for failed batch', {
                        batchKey,
                        contactCount: updates.length
                    });

                    const individualResults = await this.attemptIndividualUpdates(updates, dataExtensionKey);
                    
                    return {
                        success: individualResults.successCount > 0,
                        contactCount: updates.length,
                        successCount: individualResults.successCount,
                        failureCount: individualResults.failureCount,
                        error: result.error,
                        attempts: result.attempts,
                        gracefulDegradation: result.gracefulDegradation,
                        fallbackUsed: true,
                        batchKey
                    };
                }

                return {
                    success: false,
                    contactCount: updates.length,
                    error: result.error,
                    attempts: result.attempts,
                    gracefulDegradation: result.gracefulDegradation,
                    batchKey
                };
            }

        } catch (error) {
            this.operationLogger.logOperationFailure(tracking, error, {
                contactCount: updates?.length,
                batchKey
            });

            this.operationLogger.logBatchEvent('batch_failed', {
                batchKey,
                contactCount: updates?.length,
                error: error.message
            });

            return {
                success: false,
                contactCount: updates?.length || 0,
                error: error.message,
                attempts: 0,
                batchKey
            };
        }
    }

    /**
     * Validates that a data extension exists and has the required fields
     * @param {string} dataExtensionKey - The data extension external key
     * @returns {Promise<Object>} Validation result
     */
    async validateDataExtension(dataExtensionKey) {
        const tracking = this.operationLogger.logOperationStart('validateDataExtension', {
            dataExtensionKey
        });

        try {
            if (!dataExtensionKey) {
                throw new Error('DataExtensionKey is required for validation');
            }

            // Use error handler for retry logic and graceful degradation
            const result = await this.errorHandler.executeWithRetry(
                () => this.performDataExtensionValidation(dataExtensionKey),
                'validateDataExtension',
                { dataExtensionKey }
            );

            if (result.success) {
                const validation = result.result;
                
                this.operationLogger.logOperationSuccess(tracking, validation, {
                    dataExtensionKey,
                    attempts: result.attempts
                });

                this.operationLogger.logValidationEvent(dataExtensionKey, validation);

                return validation;
            } else {
                this.operationLogger.logOperationFailure(tracking, new Error(result.error), {
                    dataExtensionKey,
                    attempts: result.attempts,
                    gracefulDegradation: result.gracefulDegradation
                });

                // If graceful degradation is available, use it
                if (result.gracefulDegradation?.type === 'assume_valid') {
                    this.logger.warn('Using graceful degradation for data extension validation', {
                        dataExtensionKey,
                        degradation: result.gracefulDegradation
                    });

                    const assumedValidation = result.gracefulDegradation.fallbackValue;
                    this.operationLogger.logValidationEvent(dataExtensionKey, {
                        ...assumedValidation,
                        gracefulDegradation: true,
                        originalError: result.error
                    });

                    return {
                        ...assumedValidation,
                        gracefulDegradation: true,
                        originalError: result.error
                    };
                }

                // Return failure result
                const failureValidation = {
                    exists: false,
                    hasRequiredFields: false,
                    error: result.error
                };

                this.operationLogger.logValidationEvent(dataExtensionKey, failureValidation);
                return failureValidation;
            }

        } catch (error) {
            this.operationLogger.logOperationFailure(tracking, error, { dataExtensionKey });

            const failureValidation = {
                exists: false,
                hasRequiredFields: false,
                error: error.message
            };

            this.operationLogger.logValidationEvent(dataExtensionKey, failureValidation);
            return failureValidation;
        }
    }

    /**
     * Performs a single contact update (used by error handler)
     * @private
     */
    async performSingleUpdate(dataExtensionKey, updateData) {
        const endpoint = `/data/v1/customobjectdata/key/${dataExtensionKey}/rowset`;
        
        const response = await this.authService.makeAuthenticatedRequest(
            'PUT',
            endpoint,
            [updateData],
            { timeout: 20000 }
        );

        return response;
    }

    /**
     * Performs a batch update (used by error handler)
     * @private
     */
    async performBatchUpdate(dataExtensionKey, batchData) {
        const endpoint = `/data/v1/customobjectdata/key/${dataExtensionKey}/rowset`;
        
        const response = await this.authService.makeAuthenticatedRequest(
            'PUT',
            endpoint,
            batchData,
            { timeout: 30000 }
        );

        return response;
    }

    /**
     * Performs data extension validation (used by error handler)
     * @private
     */
    async performDataExtensionValidation(dataExtensionKey) {
        const endpoint = `/data/v1/customobjectdata/key/${dataExtensionKey}/rowset`;
        
        // Try to get the first row to validate structure
        const response = await this.authService.makeAuthenticatedRequest(
            'GET',
            `${endpoint}?$pageSize=1`,
            null,
            { timeout: 15000 }
        );

        const requiredFields = ['SubscriberKey', 'ConvertedTime'];
        const validation = {
            exists: true,
            hasRequiredFields: true,
            missingFields: [],
            totalRows: response.count || 0
        };

        // Check if we have any data to validate field structure
        if (response.items && response.items.length > 0) {
            const firstRow = response.items[0];
            const availableFields = Object.keys(firstRow.values || {});
            
            validation.availableFields = availableFields;
            validation.missingFields = requiredFields.filter(
                field => !availableFields.includes(field)
            );
            validation.hasRequiredFields = validation.missingFields.length === 0;
        } else {
            this.logger.warn('Data extension is empty, cannot validate field structure');
            validation.availableFields = [];
            validation.fieldValidationSkipped = true;
        }

        return validation;
    }

    /**
     * Attempts individual updates as fallback for failed batch operations
     * @private
     */
    async attemptIndividualUpdates(updates, dataExtensionKey) {
        let successCount = 0;
        let failureCount = 0;
        const results = [];

        for (const update of updates) {
            try {
                const result = await this.updateConvertedTime(
                    update.subscriberKey,
                    update.convertedTime,
                    dataExtensionKey
                );

                if (result.success) {
                    successCount++;
                } else {
                    failureCount++;
                }

                results.push(result);

            } catch (error) {
                failureCount++;
                results.push({
                    success: false,
                    subscriberKey: update.subscriberKey,
                    error: error.message
                });
            }
        }

        this.logger.info('Individual updates completed as batch fallback', {
            dataExtensionKey,
            totalUpdates: updates.length,
            successCount,
            failureCount
        });

        return {
            successCount,
            failureCount,
            results
        };
    }

    /**
     * Determines if an error should not be retried
     * @private
     */
    shouldNotRetry(error) {
        const status = error.response?.status;
        
        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (status >= 400 && status < 500 && status !== 429) {
            return true;
        }

        // Don't retry on authentication errors
        if (status === 401 || status === 403) {
            return true;
        }

        // Don't retry on validation errors
        if (error.message.includes('validation') || error.message.includes('invalid')) {
            return true;
        }

        return false;
    }

    /**
     * Sleep utility for retry delays
     * @private
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Gets comprehensive error statistics
     * @returns {Object} Error statistics
     */
    getErrorStatistics() {
        return this.errorHandler.getErrorStats();
    }

    /**
     * Gets operation metrics and performance data
     * @returns {Object} Operation metrics
     */
    getOperationMetrics() {
        return this.operationLogger.getMetrics();
    }

    /**
     * Gets recent operation logs for debugging
     * @param {number} count - Number of recent logs to return
     * @returns {Array} Recent log entries
     */
    getRecentLogs(count = 50) {
        return this.operationLogger.getRecentLogs(count);
    }

    /**
     * Resets error statistics and operation metrics
     */
    resetStatistics() {
        this.errorHandler.resetErrorStats();
        this.operationLogger.clearMetrics();
    }

    /**
     * Gets the authentication service status for debugging
     * @returns {Object} Authentication status
     */
    getAuthStatus() {
        return this.authService.getTokenStatus();
    }

    /**
     * Clears authentication token (useful for testing)
     */
    clearAuthToken() {
        this.authService.clearToken();
    }

    /**
     * Gets comprehensive health status including auth, errors, and metrics
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return {
            authentication: this.getAuthStatus(),
            errorStatistics: this.getErrorStatistics(),
            operationMetrics: this.getOperationMetrics(),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = DataExtensionAPI;