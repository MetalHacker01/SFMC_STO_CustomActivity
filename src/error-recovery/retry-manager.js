/**
 * Retry Manager
 * Implements retry logic with exponential backoff for API calls
 * Provides configurable retry strategies for different operation types
 */

const { createApiLogger } = require('../logging');

/**
 * Retry Manager class that handles retry logic with exponential backoff
 */
class RetryManager {
    constructor(config = {}) {
        this.config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000, // 1 second
            maxDelay: config.maxDelay || 30000, // 30 seconds
            backoffMultiplier: config.backoffMultiplier || 2,
            jitterEnabled: config.jitterEnabled !== false,
            retryableErrors: config.retryableErrors || [
                'ECONNRESET',
                'ENOTFOUND',
                'ECONNREFUSED',
                'ETIMEDOUT',
                'TIMEOUT',
                'NETWORK_ERROR',
                'SERVICE_UNAVAILABLE'
            ],
            retryableStatusCodes: config.retryableStatusCodes || [
                408, // Request Timeout
                429, // Too Many Requests
                500, // Internal Server Error
                502, // Bad Gateway
                503, // Service Unavailable
                504  // Gateway Timeout
            ],
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'debug' });
        this.retryStats = {
            totalAttempts: 0,
            successfulRetries: 0,
            failedRetries: 0,
            operationStats: {}
        };
    }

    /**
     * Execute operation with retry logic
     * @param {Function} operation - Async operation to execute
     * @param {Object} options - Retry options
     * @returns {Promise} Operation result
     */
    async executeWithRetry(operation, options = {}) {
        const retryOptions = {
            maxRetries: options.maxRetries || this.config.maxRetries,
            baseDelay: options.baseDelay || this.config.baseDelay,
            maxDelay: options.maxDelay || this.config.maxDelay,
            backoffMultiplier: options.backoffMultiplier || this.config.backoffMultiplier,
            operationName: options.operationName || 'unknown',
            context: options.context || {},
            onRetry: options.onRetry,
            shouldRetry: options.shouldRetry || this._shouldRetry.bind(this)
        };

        const operationId = this._generateOperationId();
        let lastError;
        let attempt = 0;

        this.logger.debug(`Starting operation with retry`, {
            operationId,
            operationName: retryOptions.operationName,
            maxRetries: retryOptions.maxRetries,
            context: retryOptions.context
        }, 'retry');

        while (attempt <= retryOptions.maxRetries) {
            try {
                this.retryStats.totalAttempts++;
                this._updateOperationStats(retryOptions.operationName, 'attempt');

                const startTime = Date.now();
                const result = await operation();
                const duration = Date.now() - startTime;

                this.logger.debug(`Operation succeeded`, {
                    operationId,
                    operationName: retryOptions.operationName,
                    attempt: attempt + 1,
                    duration: `${duration}ms`
                }, 'retry');

                if (attempt > 0) {
                    this.retryStats.successfulRetries++;
                    this._updateOperationStats(retryOptions.operationName, 'success');
                }

                return result;

            } catch (error) {
                lastError = error;
                attempt++;

                const shouldRetry = attempt <= retryOptions.maxRetries && 
                                 retryOptions.shouldRetry(error, attempt);

                this.logger.warn(`Operation failed`, {
                    operationId,
                    operationName: retryOptions.operationName,
                    attempt,
                    error: error.message,
                    errorCode: error.code,
                    statusCode: error.response?.status,
                    willRetry: shouldRetry
                }, 'retry');

                if (!shouldRetry) {
                    if (attempt > 1) {
                        this.retryStats.failedRetries++;
                        this._updateOperationStats(retryOptions.operationName, 'failed');
                    }
                    break;
                }

                // Calculate delay with exponential backoff and jitter
                const delay = this._calculateDelay(attempt - 1, retryOptions);
                
                this.logger.debug(`Retrying operation after delay`, {
                    operationId,
                    operationName: retryOptions.operationName,
                    attempt,
                    delay: `${delay}ms`
                }, 'retry');

                // Call onRetry callback if provided
                if (retryOptions.onRetry) {
                    try {
                        await retryOptions.onRetry(error, attempt, delay);
                    } catch (callbackError) {
                        this.logger.warn(`Retry callback failed`, {
                            operationId,
                            error: callbackError.message
                        }, 'retry');
                    }
                }

                await this._delay(delay);
            }
        }

        // All retries exhausted
        this.logger.error(`Operation failed after all retries`, {
            operationId,
            operationName: retryOptions.operationName,
            totalAttempts: attempt,
            finalError: lastError.message
        }, 'retry');

        throw new RetryExhaustedError(
            `Operation '${retryOptions.operationName}' failed after ${attempt} attempts`,
            lastError,
            attempt
        );
    }

    /**
     * Execute operation with custom retry strategy
     * @param {Function} operation - Async operation to execute
     * @param {Function} retryStrategy - Custom retry strategy function
     * @param {Object} context - Operation context
     * @returns {Promise} Operation result
     */
    async executeWithCustomStrategy(operation, retryStrategy, context = {}) {
        const operationId = this._generateOperationId();
        let attempt = 0;
        let lastError;

        this.logger.debug(`Starting operation with custom retry strategy`, {
            operationId,
            context
        }, 'retry');

        while (true) {
            try {
                this.retryStats.totalAttempts++;
                const result = await operation();
                
                if (attempt > 0) {
                    this.retryStats.successfulRetries++;
                }

                return result;

            } catch (error) {
                lastError = error;
                attempt++;

                const retryDecision = await retryStrategy(error, attempt, context);

                if (!retryDecision.shouldRetry) {
                    if (attempt > 1) {
                        this.retryStats.failedRetries++;
                    }
                    break;
                }

                this.logger.debug(`Custom retry strategy: retrying`, {
                    operationId,
                    attempt,
                    delay: retryDecision.delay,
                    reason: retryDecision.reason
                }, 'retry');

                if (retryDecision.delay > 0) {
                    await this._delay(retryDecision.delay);
                }
            }
        }

        throw new RetryExhaustedError(
            `Custom retry strategy exhausted after ${attempt} attempts`,
            lastError,
            attempt
        );
    }

    /**
     * Create a retry wrapper for a function
     * @param {Function} fn - Function to wrap
     * @param {Object} options - Retry options
     * @returns {Function} Wrapped function with retry logic
     */
    wrapWithRetry(fn, options = {}) {
        return async (...args) => {
            return this.executeWithRetry(() => fn(...args), options);
        };
    }

    /**
     * Get retry statistics
     * @returns {Object} Current retry statistics
     */
    getStats() {
        const totalOperations = this.retryStats.successfulRetries + this.retryStats.failedRetries;
        
        return {
            ...this.retryStats,
            successRate: totalOperations > 0 
                ? ((this.retryStats.successfulRetries / totalOperations) * 100).toFixed(2) + '%'
                : '0%',
            averageAttemptsPerOperation: totalOperations > 0
                ? (this.retryStats.totalAttempts / totalOperations).toFixed(2)
                : '0'
        };
    }

    /**
     * Reset retry statistics
     */
    resetStats() {
        this.retryStats = {
            totalAttempts: 0,
            successfulRetries: 0,
            failedRetries: 0,
            operationStats: {}
        };
    }

    /**
     * Check if error should be retried
     * @private
     */
    _shouldRetry(error, attempt) {
        // Check error code
        if (error.code && this.config.retryableErrors.includes(error.code)) {
            return true;
        }

        // Check HTTP status code
        if (error.response?.status && this.config.retryableStatusCodes.includes(error.response.status)) {
            return true;
        }

        // Check error message for common patterns
        const errorMessage = error.message?.toLowerCase() || '';
        const retryablePatterns = [
            'timeout',
            'network error',
            'connection reset',
            'service unavailable',
            'temporary failure',
            'rate limit'
        ];

        return retryablePatterns.some(pattern => errorMessage.includes(pattern));
    }

    /**
     * Calculate delay with exponential backoff and jitter
     * @private
     */
    _calculateDelay(attemptNumber, options) {
        let delay = options.baseDelay * Math.pow(options.backoffMultiplier, attemptNumber);
        
        // Apply maximum delay limit
        delay = Math.min(delay, options.maxDelay);

        // Add jitter to prevent thundering herd
        if (this.config.jitterEnabled) {
            const jitter = delay * 0.1 * Math.random(); // Up to 10% jitter
            delay += jitter;
        }

        return Math.round(delay);
    }

    /**
     * Delay execution
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique operation ID
     * @private
     */
    _generateOperationId() {
        return `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Update operation statistics
     * @private
     */
    _updateOperationStats(operationName, type) {
        if (!this.retryStats.operationStats[operationName]) {
            this.retryStats.operationStats[operationName] = {
                attempts: 0,
                successes: 0,
                failures: 0
            };
        }

        const stats = this.retryStats.operationStats[operationName];
        
        switch (type) {
            case 'attempt':
                stats.attempts++;
                break;
            case 'success':
                stats.successes++;
                break;
            case 'failed':
                stats.failures++;
                break;
        }
    }
}

/**
 * Custom error class for retry exhaustion
 */
class RetryExhaustedError extends Error {
    constructor(message, originalError, attempts) {
        super(message);
        this.name = 'RetryExhaustedError';
        this.originalError = originalError;
        this.attempts = attempts;
        this.code = 'RETRY_EXHAUSTED';
    }
}

/**
 * Predefined retry strategies
 */
const RetryStrategies = {
    /**
     * Exponential backoff strategy
     */
    exponentialBackoff: (maxRetries = 3, baseDelay = 1000, maxDelay = 30000) => ({
        maxRetries,
        baseDelay,
        maxDelay,
        backoffMultiplier: 2,
        operationName: 'exponential-backoff'
    }),

    /**
     * Linear backoff strategy
     */
    linearBackoff: (maxRetries = 3, delay = 1000) => ({
        maxRetries,
        baseDelay: delay,
        maxDelay: delay,
        backoffMultiplier: 1,
        operationName: 'linear-backoff'
    }),

    /**
     * Fixed delay strategy
     */
    fixedDelay: (maxRetries = 3, delay = 1000) => ({
        maxRetries,
        baseDelay: delay,
        maxDelay: delay,
        backoffMultiplier: 1,
        jitterEnabled: false,
        operationName: 'fixed-delay'
    }),

    /**
     * Immediate retry strategy (no delay)
     */
    immediate: (maxRetries = 3) => ({
        maxRetries,
        baseDelay: 0,
        maxDelay: 0,
        backoffMultiplier: 1,
        jitterEnabled: false,
        operationName: 'immediate'
    }),

    /**
     * API-specific retry strategy
     */
    apiCall: (maxRetries = 3) => ({
        maxRetries,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableStatusCodes: [408, 429, 500, 502, 503, 504],
        operationName: 'api-call'
    }),

    /**
     * Database operation retry strategy
     */
    database: (maxRetries = 2) => ({
        maxRetries,
        baseDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 2,
        retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'],
        operationName: 'database'
    })
};

module.exports = {
    RetryManager,
    RetryExhaustedError,
    RetryStrategies
};