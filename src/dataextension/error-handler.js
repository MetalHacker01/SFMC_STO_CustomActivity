/**
 * Data Extension Error Handler
 * Provides comprehensive error handling, retry logic, and graceful degradation
 */

class DataExtensionErrorHandler {
    constructor(config = {}, logger = console) {
        this.logger = logger;
        
        // Error handling configuration
        this.config = {
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            backoffMultiplier: config.backoffMultiplier || 2,
            maxRetryDelay: config.maxRetryDelay || 30000,
            enableGracefulDegradation: config.enableGracefulDegradation !== false,
            logLevel: config.logLevel || 'info'
        };

        // Error classification patterns
        this.errorPatterns = {
            authentication: [
                /unauthorized/i,
                /invalid.*token/i,
                /authentication.*failed/i,
                /access.*denied/i
            ],
            rateLimit: [
                /rate.*limit/i,
                /too.*many.*requests/i,
                /quota.*exceeded/i
            ],
            validation: [
                /validation.*failed/i,
                /invalid.*data/i,
                /bad.*request/i,
                /malformed/i
            ],
            network: [
                /network.*error/i,
                /connection.*failed/i,
                /timeout/i,
                /econnreset/i,
                /enotfound/i
            ],
            serverError: [
                /internal.*server.*error/i,
                /service.*unavailable/i,
                /bad.*gateway/i
            ]
        };

        // Error statistics
        this.errorStats = {
            totalErrors: 0,
            errorsByType: {},
            errorsByOperation: {},
            lastError: null,
            lastErrorTime: null
        };
    }

    /**
     * Handles errors with appropriate retry logic and logging
     * @param {Error} error - The error to handle
     * @param {string} operation - The operation that failed
     * @param {Object} context - Additional context information
     * @param {number} attempt - Current attempt number
     * @returns {Object} Error handling result
     */
    async handleError(error, operation, context = {}, attempt = 1) {
        const errorType = this.classifyError(error);
        const shouldRetry = this.shouldRetry(error, errorType, attempt);
        
        // Update error statistics
        this.updateErrorStats(error, errorType, operation);

        // Log the error
        this.logError(error, operation, context, attempt, errorType, shouldRetry);

        const result = {
            error,
            errorType,
            operation,
            attempt,
            shouldRetry,
            retryDelay: shouldRetry ? this.calculateRetryDelay(attempt) : 0,
            gracefulDegradation: null
        };

        // Apply graceful degradation if enabled and appropriate
        if (!shouldRetry && this.config.enableGracefulDegradation) {
            result.gracefulDegradation = this.applyGracefulDegradation(error, errorType, operation, context);
        }

        return result;
    }

    /**
     * Executes an operation with retry logic
     * @param {Function} operation - The operation to execute
     * @param {string} operationName - Name of the operation for logging
     * @param {Object} context - Context information
     * @returns {Promise<Object>} Operation result
     */
    async executeWithRetry(operation, operationName, context = {}) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                this.logger.debug(`Executing ${operationName} (attempt ${attempt})`, {
                    operation: operationName,
                    attempt,
                    context
                });

                const result = await operation();
                
                // Log successful retry if this wasn't the first attempt
                if (attempt > 1) {
                    this.logger.info(`${operationName} succeeded after retry`, {
                        operation: operationName,
                        attempt,
                        context
                    });
                }

                return {
                    success: true,
                    result,
                    attempts: attempt
                };

            } catch (error) {
                lastError = error;
                
                const errorHandling = await this.handleError(error, operationName, context, attempt);
                
                if (!errorHandling.shouldRetry || attempt >= this.config.maxRetries) {
                    // Final failure - check for graceful degradation
                    if (errorHandling.gracefulDegradation) {
                        this.logger.warn(`${operationName} failed, applying graceful degradation`, {
                            operation: operationName,
                            attempts: attempt,
                            degradation: errorHandling.gracefulDegradation.type
                        });

                        return {
                            success: false,
                            error: error.message,
                            attempts: attempt,
                            gracefulDegradation: errorHandling.gracefulDegradation
                        };
                    }

                    // No graceful degradation available
                    return {
                        success: false,
                        error: error.message,
                        attempts: attempt,
                        errorType: errorHandling.errorType
                    };
                }

                // Wait before retrying
                if (errorHandling.retryDelay > 0) {
                    await this.sleep(errorHandling.retryDelay);
                }
            }
        }

        // This should never be reached, but just in case
        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            attempts: this.config.maxRetries
        };
    }

    /**
     * Classifies an error based on its characteristics
     * @param {Error} error - The error to classify
     * @returns {string} Error type
     */
    classifyError(error) {
        const message = error.message || '';
        const status = error.response?.status;

        // Check HTTP status codes first
        if (status) {
            if (status === 401 || status === 403) return 'authentication';
            if (status === 429) return 'rateLimit';
            if (status >= 400 && status < 500) return 'validation';
            if (status >= 500) return 'serverError';
        }

        // Check error message patterns
        for (const [type, patterns] of Object.entries(this.errorPatterns)) {
            if (patterns.some(pattern => pattern.test(message))) {
                return type;
            }
        }

        // Default classification
        return 'unknown';
    }

    /**
     * Determines if an error should be retried
     * @param {Error} error - The error
     * @param {string} errorType - Classified error type
     * @param {number} attempt - Current attempt number
     * @returns {boolean} Whether to retry
     */
    shouldRetry(error, errorType, attempt) {
        // Don't retry if we've reached max attempts
        if (attempt >= this.config.maxRetries) {
            return false;
        }

        // Don't retry certain error types
        const nonRetryableTypes = ['authentication', 'validation'];
        if (nonRetryableTypes.includes(errorType)) {
            return false;
        }

        // Always retry network and server errors
        const retryableTypes = ['network', 'serverError', 'rateLimit'];
        if (retryableTypes.includes(errorType)) {
            return true;
        }

        // For unknown errors, check status code
        const status = error.response?.status;
        if (status) {
            // Don't retry client errors (except rate limiting)
            if (status >= 400 && status < 500 && status !== 429) {
                return false;
            }
            // Retry server errors
            if (status >= 500) {
                return true;
            }
        }

        // Default to retry for unknown errors
        return true;
    }

    /**
     * Calculates retry delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt) {
        const delay = this.config.retryDelay * Math.pow(this.config.backoffMultiplier, attempt - 1);
        return Math.min(delay, this.config.maxRetryDelay);
    }

    /**
     * Applies graceful degradation strategies
     * @param {Error} error - The error
     * @param {string} errorType - Error type
     * @param {string} operation - Operation name
     * @param {Object} context - Context information
     * @returns {Object|null} Graceful degradation strategy
     */
    applyGracefulDegradation(error, errorType, operation, context) {
        switch (operation) {
            case 'updateConvertedTime':
                return {
                    type: 'continue_journey',
                    message: 'ConvertedTime update failed, but journey will continue',
                    fallbackValue: null,
                    impact: 'Contact will not have optimized send time'
                };

            case 'batchUpdateConvertedTime':
                return {
                    type: 'partial_success',
                    message: 'Batch update failed, individual updates may still succeed',
                    fallbackValue: 'individual_updates',
                    impact: 'Reduced performance but functionality maintained'
                };

            case 'validateDataExtension':
                return {
                    type: 'assume_valid',
                    message: 'Validation failed, assuming data extension is valid',
                    fallbackValue: { exists: true, hasRequiredFields: true },
                    impact: 'May encounter runtime errors if data extension is invalid'
                };

            default:
                return {
                    type: 'log_and_continue',
                    message: 'Operation failed, logging error and continuing',
                    fallbackValue: null,
                    impact: 'Functionality may be degraded'
                };
        }
    }

    /**
     * Logs errors with appropriate level and detail
     * @private
     */
    logError(error, operation, context, attempt, errorType, shouldRetry) {
        const logData = {
            operation,
            attempt,
            errorType,
            shouldRetry,
            error: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            context
        };

        // Include response data for debugging if available
        if (error.response?.data && this.config.logLevel === 'debug') {
            logData.responseData = error.response.data;
        }

        if (shouldRetry) {
            this.logger.warn(`${operation} failed, will retry`, logData);
        } else {
            this.logger.error(`${operation} failed, no retry`, logData);
        }
    }

    /**
     * Updates error statistics
     * @private
     */
    updateErrorStats(error, errorType, operation) {
        this.errorStats.totalErrors++;
        this.errorStats.lastError = error.message;
        this.errorStats.lastErrorTime = new Date();

        // Update error counts by type
        if (!this.errorStats.errorsByType[errorType]) {
            this.errorStats.errorsByType[errorType] = 0;
        }
        this.errorStats.errorsByType[errorType]++;

        // Update error counts by operation
        if (!this.errorStats.errorsByOperation[operation]) {
            this.errorStats.errorsByOperation[operation] = 0;
        }
        this.errorStats.errorsByOperation[operation]++;
    }

    /**
     * Gets error statistics
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            config: {
                maxRetries: this.config.maxRetries,
                retryDelay: this.config.retryDelay,
                enableGracefulDegradation: this.config.enableGracefulDegradation
            }
        };
    }

    /**
     * Resets error statistics
     */
    resetErrorStats() {
        this.errorStats = {
            totalErrors: 0,
            errorsByType: {},
            errorsByOperation: {},
            lastError: null,
            lastErrorTime: null
        };
    }

    /**
     * Sleep utility for retry delays
     * @private
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Creates a wrapped version of a function with error handling
     * @param {Function} fn - Function to wrap
     * @param {string} operationName - Name for logging
     * @returns {Function} Wrapped function
     */
    wrapWithErrorHandling(fn, operationName) {
        return async (...args) => {
            return await this.executeWithRetry(
                () => fn(...args),
                operationName,
                { args: args.length }
            );
        };
    }
}

module.exports = DataExtensionErrorHandler;