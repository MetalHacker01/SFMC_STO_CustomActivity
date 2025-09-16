/**
 * ConvertedTime Field Updater
 * Handles updating ConvertedTime fields in SFMC data extensions with batch processing
 */

const DataExtensionAPI = require('./data-extension-api');

class ConvertedTimeUpdater {
    constructor(config, logger = console) {
        this.dataExtensionAPI = new DataExtensionAPI(config, logger);
        this.logger = logger;
        
        // Batch processing configuration
        this.batchConfig = {
            maxBatchSize: config.maxBatchSize || 50,
            batchTimeout: config.batchTimeout || 5000,
            enableBatching: config.enableBatching !== false
        };
        
        // Pending updates for batch processing
        this.pendingUpdates = new Map();
        this.batchTimer = null;
    }

    /**
     * Updates ConvertedTime for a single contact
     * @param {string} subscriberKey - The subscriber key
     * @param {Date} convertedTime - The calculated send time
     * @param {string} dataExtensionKey - The data extension external key
     * @param {Object} options - Update options
     * @returns {Promise<Object>} Update result
     */
    async updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey, options = {}) {
        if (!subscriberKey) {
            throw new Error('SubscriberKey is required for ConvertedTime update');
        }

        if (!convertedTime || !(convertedTime instanceof Date)) {
            throw new Error('ConvertedTime must be a valid Date object');
        }

        if (!dataExtensionKey) {
            throw new Error('DataExtensionKey is required for ConvertedTime update');
        }

        // Validate that the converted time is in the future
        if (convertedTime <= new Date()) {
            this.logger.warn('ConvertedTime is not in the future, this may cause issues with Wait By Attribute', {
                subscriberKey,
                convertedTime: convertedTime.toISOString(),
                currentTime: new Date().toISOString()
            });
        }

        try {
            this.logger.info('Updating ConvertedTime for contact', {
                subscriberKey,
                convertedTime: convertedTime.toISOString(),
                dataExtensionKey
            });

            const result = await this.dataExtensionAPI.updateConvertedTime(
                subscriberKey,
                convertedTime,
                dataExtensionKey
            );

            // Enhanced logging based on result
            if (result.success) {
                this.logger.info('ConvertedTime updated successfully', {
                    subscriberKey,
                    convertedTime: convertedTime.toISOString(),
                    attempts: result.attempts
                });
            } else {
                // Log different levels based on whether graceful degradation was applied
                if (result.gracefulDegradation) {
                    this.logger.warn('ConvertedTime update failed but graceful degradation applied', {
                        subscriberKey,
                        error: result.error,
                        attempts: result.attempts,
                        degradationType: result.gracefulDegradation.type,
                        impact: result.gracefulDegradation.impact
                    });
                } else {
                    this.logger.error('ConvertedTime update failed', {
                        subscriberKey,
                        error: result.error,
                        attempts: result.attempts
                    });
                }
            }

            return result;

        } catch (error) {
            this.logger.error('ConvertedTime update error', {
                subscriberKey,
                error: error.message
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
     * Adds a contact to the batch update queue
     * @param {string} subscriberKey - The subscriber key
     * @param {Date} convertedTime - The calculated send time
     * @param {string} dataExtensionKey - The data extension external key
     * @returns {Promise<void>}
     */
    async queueBatchUpdate(subscriberKey, convertedTime, dataExtensionKey) {
        if (!this.batchConfig.enableBatching) {
            // If batching is disabled, process immediately
            return await this.updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey);
        }

        if (!subscriberKey || !convertedTime || !dataExtensionKey) {
            throw new Error('All parameters are required for batch update queue');
        }

        // Create batch key (group by data extension)
        const batchKey = dataExtensionKey;
        
        if (!this.pendingUpdates.has(batchKey)) {
            this.pendingUpdates.set(batchKey, []);
        }

        const batch = this.pendingUpdates.get(batchKey);
        
        // Add to batch
        batch.push({
            subscriberKey,
            convertedTime,
            dataExtensionKey,
            queuedAt: new Date()
        });

        this.logger.debug('Added contact to batch update queue', {
            subscriberKey,
            batchKey,
            batchSize: batch.length,
            maxBatchSize: this.batchConfig.maxBatchSize
        });

        // Process batch if it's full
        if (batch.length >= this.batchConfig.maxBatchSize) {
            await this.processBatch(batchKey);
        } else {
            // Set timer to process batch after timeout
            this.scheduleBatchProcessing();
        }
    }

    /**
     * Processes all pending batches immediately
     * @returns {Promise<Array>} Array of batch results
     */
    async flushAllBatches() {
        const results = [];
        
        for (const batchKey of this.pendingUpdates.keys()) {
            const result = await this.processBatch(batchKey);
            results.push(result);
        }

        // Clear the batch timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        return results;
    }

    /**
     * Processes a specific batch
     * @private
     */
    async processBatch(batchKey) {
        const batch = this.pendingUpdates.get(batchKey);
        
        if (!batch || batch.length === 0) {
            return { success: true, batchKey, contactCount: 0 };
        }

        // Remove batch from pending updates
        this.pendingUpdates.delete(batchKey);

        try {
            this.logger.info('Processing batch update', {
                batchKey,
                contactCount: batch.length
            });

            // Convert to format expected by DataExtensionAPI
            const updates = batch.map(item => ({
                subscriberKey: item.subscriberKey,
                convertedTime: item.convertedTime
            }));

            const result = await this.dataExtensionAPI.batchUpdateConvertedTime(updates, batchKey);

            // Enhanced logging based on result
            if (result.success) {
                this.logger.info('Batch update completed successfully', {
                    batchKey,
                    contactCount: result.contactCount,
                    attempts: result.attempts
                });
            } else {
                // Log different levels based on whether graceful degradation was applied
                if (result.gracefulDegradation) {
                    this.logger.warn('Batch update failed but graceful degradation applied', {
                        batchKey,
                        contactCount: result.contactCount,
                        error: result.error,
                        attempts: result.attempts,
                        degradationType: result.gracefulDegradation.type,
                        fallbackUsed: result.fallbackUsed,
                        successCount: result.successCount,
                        failureCount: result.failureCount
                    });
                } else {
                    this.logger.error('Batch update failed', {
                        batchKey,
                        contactCount: result.contactCount,
                        error: result.error,
                        attempts: result.attempts
                    });
                }
            }

            return {
                ...result,
                batchKey,
                processedAt: new Date()
            };

        } catch (error) {
            this.logger.error('Batch processing error', {
                batchKey,
                contactCount: batch.length,
                error: error.message
            });

            return {
                success: false,
                batchKey,
                contactCount: batch.length,
                error: error.message,
                processedAt: new Date()
            };
        }
    }

    /**
     * Schedules batch processing after timeout
     * @private
     */
    scheduleBatchProcessing() {
        // Clear existing timer
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }

        // Set new timer
        this.batchTimer = setTimeout(async () => {
            try {
                await this.flushAllBatches();
            } catch (error) {
                this.logger.error('Scheduled batch processing error', {
                    error: error.message
                });
            }
        }, this.batchConfig.batchTimeout);
    }

    /**
     * Validates data extension before processing updates
     * @param {string} dataExtensionKey - The data extension external key
     * @returns {Promise<Object>} Validation result
     */
    async validateDataExtension(dataExtensionKey) {
        try {
            this.logger.info('Validating data extension for ConvertedTime updates', {
                dataExtensionKey
            });

            const validation = await this.dataExtensionAPI.validateDataExtension(dataExtensionKey);

            // Enhanced logging based on validation result
            if (!validation.exists) {
                this.logger.error('Data extension does not exist', {
                    dataExtensionKey,
                    error: validation.error
                });
                return validation;
            }

            if (!validation.hasRequiredFields) {
                if (validation.gracefulDegradation) {
                    this.logger.warn('Data extension validation failed but graceful degradation applied', {
                        dataExtensionKey,
                        missingFields: validation.missingFields,
                        originalError: validation.originalError,
                        degradationType: 'assume_valid'
                    });
                } else {
                    this.logger.error('Data extension missing required fields for ConvertedTime updates', {
                        dataExtensionKey,
                        missingFields: validation.missingFields
                    });
                }
            } else {
                this.logger.info('Data extension validation successful', {
                    dataExtensionKey,
                    totalRows: validation.totalRows,
                    availableFields: validation.availableFields?.length,
                    gracefulDegradation: validation.gracefulDegradation || false
                });
            }

            return validation;

        } catch (error) {
            this.logger.error('Data extension validation error', {
                dataExtensionKey,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Gets statistics about pending batches
     * @returns {Object} Batch statistics
     */
    getBatchStatistics() {
        const stats = {
            totalPendingBatches: this.pendingUpdates.size,
            totalPendingContacts: 0,
            batchDetails: [],
            batchingEnabled: this.batchConfig.enableBatching,
            maxBatchSize: this.batchConfig.maxBatchSize,
            batchTimeout: this.batchConfig.batchTimeout
        };

        for (const [batchKey, batch] of this.pendingUpdates.entries()) {
            stats.totalPendingContacts += batch.length;
            stats.batchDetails.push({
                batchKey,
                contactCount: batch.length,
                oldestQueuedAt: batch.length > 0 ? Math.min(...batch.map(item => item.queuedAt.getTime())) : null
            });
        }

        return stats;
    }

    /**
     * Gets comprehensive error statistics from the underlying API
     * @returns {Object} Error statistics
     */
    getErrorStatistics() {
        return this.dataExtensionAPI.getErrorStatistics();
    }

    /**
     * Gets operation metrics from the underlying API
     * @returns {Object} Operation metrics
     */
    getOperationMetrics() {
        return this.dataExtensionAPI.getOperationMetrics();
    }

    /**
     * Gets recent operation logs for debugging
     * @param {number} count - Number of recent logs to return
     * @returns {Array} Recent log entries
     */
    getRecentLogs(count = 50) {
        return this.dataExtensionAPI.getRecentLogs(count);
    }

    /**
     * Gets comprehensive health status including batch statistics
     * @returns {Object} Health status
     */
    getHealthStatus() {
        const apiHealth = this.dataExtensionAPI.getHealthStatus();
        const batchStats = this.getBatchStatistics();

        return {
            ...apiHealth,
            batchProcessing: {
                ...batchStats,
                batchTimerActive: this.batchTimer !== null
            }
        };
    }

    /**
     * Resets all statistics and metrics
     */
    resetStatistics() {
        this.dataExtensionAPI.resetStatistics();
    }

    /**
     * Gets authentication status from the underlying API
     * @returns {Object} Authentication status
     */
    getAuthStatus() {
        return this.dataExtensionAPI.getAuthStatus();
    }

    /**
     * Clears authentication token
     */
    clearAuthToken() {
        this.dataExtensionAPI.clearAuthToken();
    }

    /**
     * Cleans up resources (should be called when shutting down)
     */
    cleanup() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }

        // Process any remaining batches
        return this.flushAllBatches();
    }
}

module.exports = ConvertedTimeUpdater;