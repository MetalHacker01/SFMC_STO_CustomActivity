/**
 * Data Extension Operation Logger
 * Provides comprehensive logging for all data extension operations
 */

class DataExtensionOperationLogger {
    constructor(config = {}, baseLogger = console) {
        this.baseLogger = baseLogger;
        
        this.config = {
            logLevel: config.logLevel || 'info',
            includeTimestamps: config.includeTimestamps !== false,
            includeContext: config.includeContext !== false,
            maxLogEntries: config.maxLogEntries || 1000,
            enableMetrics: config.enableMetrics !== false
        };

        // Operation metrics
        this.metrics = {
            operations: {},
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            averageResponseTime: 0,
            startTime: new Date()
        };

        // Recent log entries for debugging
        this.recentLogs = [];
    }

    /**
     * Logs the start of an operation
     * @param {string} operation - Operation name
     * @param {Object} context - Operation context
     * @returns {Object} Operation tracking object
     */
    logOperationStart(operation, context = {}) {
        const operationId = this.generateOperationId();
        const startTime = Date.now();
        
        const logEntry = {
            operationId,
            operation,
            phase: 'start',
            timestamp: new Date().toISOString(),
            startTime,
            context: this.sanitizeContext(context)
        };

        this.addLogEntry(logEntry);
        this.debug(`Starting ${operation}`, logEntry);

        return {
            operationId,
            startTime,
            operation,
            context
        };
    }

    /**
     * Logs successful completion of an operation
     * @param {Object} tracking - Operation tracking object from logOperationStart
     * @param {Object} result - Operation result
     * @param {Object} additionalContext - Additional context
     */
    logOperationSuccess(tracking, result = {}, additionalContext = {}) {
        const endTime = Date.now();
        const duration = endTime - tracking.startTime;

        const logEntry = {
            operationId: tracking.operationId,
            operation: tracking.operation,
            phase: 'success',
            timestamp: new Date().toISOString(),
            duration,
            result: this.sanitizeResult(result),
            context: { ...tracking.context, ...additionalContext }
        };

        this.addLogEntry(logEntry);
        this.updateMetrics(tracking.operation, true, duration);
        
        this.info(`${tracking.operation} completed successfully`, {
            operationId: tracking.operationId,
            duration: `${duration}ms`,
            ...logEntry.context
        });
    }

    /**
     * Logs operation failure
     * @param {Object} tracking - Operation tracking object from logOperationStart
     * @param {Error} error - The error that occurred
     * @param {Object} additionalContext - Additional context
     */
    logOperationFailure(tracking, error, additionalContext = {}) {
        const endTime = Date.now();
        const duration = endTime - tracking.startTime;

        const logEntry = {
            operationId: tracking.operationId,
            operation: tracking.operation,
            phase: 'failure',
            timestamp: new Date().toISOString(),
            duration,
            error: {
                message: error.message,
                type: error.constructor.name,
                status: error.response?.status,
                statusText: error.response?.statusText
            },
            context: { ...tracking.context, ...additionalContext }
        };

        this.addLogEntry(logEntry);
        this.updateMetrics(tracking.operation, false, duration);
        
        this.error(`${tracking.operation} failed`, {
            operationId: tracking.operationId,
            duration: `${duration}ms`,
            error: logEntry.error,
            ...logEntry.context
        });
    }

    /**
     * Logs authentication events
     * @param {string} event - Authentication event type
     * @param {Object} context - Event context
     */
    logAuthEvent(event, context = {}) {
        const logEntry = {
            type: 'authentication',
            event,
            timestamp: new Date().toISOString(),
            context: this.sanitizeContext(context)
        };

        this.addLogEntry(logEntry);

        switch (event) {
            case 'token_requested':
                this.debug('SFMC authentication token requested', logEntry);
                break;
            case 'token_received':
                this.info('SFMC authentication successful', {
                    expiresIn: context.expiresIn,
                    tokenType: context.tokenType
                });
                break;
            case 'token_refresh':
                this.info('SFMC token refreshed', logEntry);
                break;
            case 'token_expired':
                this.warn('SFMC token expired', logEntry);
                break;
            case 'auth_failed':
                this.error('SFMC authentication failed', {
                    error: context.error,
                    status: context.status
                });
                break;
            default:
                this.debug(`Authentication event: ${event}`, logEntry);
        }
    }

    /**
     * Logs data extension validation events
     * @param {string} dataExtensionKey - Data extension key
     * @param {Object} validationResult - Validation result
     */
    logValidationEvent(dataExtensionKey, validationResult) {
        const logEntry = {
            type: 'validation',
            dataExtensionKey,
            timestamp: new Date().toISOString(),
            result: validationResult
        };

        this.addLogEntry(logEntry);

        if (validationResult.exists && validationResult.hasRequiredFields) {
            this.info('Data extension validation successful', {
                dataExtensionKey,
                totalRows: validationResult.totalRows,
                availableFields: validationResult.availableFields?.length
            });
        } else if (!validationResult.exists) {
            this.error('Data extension does not exist', {
                dataExtensionKey,
                error: validationResult.error
            });
        } else if (!validationResult.hasRequiredFields) {
            this.warn('Data extension missing required fields', {
                dataExtensionKey,
                missingFields: validationResult.missingFields
            });
        }
    }

    /**
     * Logs batch processing events
     * @param {string} event - Batch event type
     * @param {Object} context - Event context
     */
    logBatchEvent(event, context = {}) {
        const logEntry = {
            type: 'batch',
            event,
            timestamp: new Date().toISOString(),
            context: this.sanitizeContext(context)
        };

        this.addLogEntry(logEntry);

        switch (event) {
            case 'batch_created':
                this.debug('Batch created', {
                    batchKey: context.batchKey,
                    contactCount: context.contactCount
                });
                break;
            case 'batch_processed':
                this.info('Batch processed', {
                    batchKey: context.batchKey,
                    contactCount: context.contactCount,
                    success: context.success,
                    duration: context.duration
                });
                break;
            case 'batch_timeout':
                this.info('Batch processed due to timeout', {
                    batchKey: context.batchKey,
                    contactCount: context.contactCount
                });
                break;
            case 'batch_failed':
                this.error('Batch processing failed', {
                    batchKey: context.batchKey,
                    contactCount: context.contactCount,
                    error: context.error
                });
                break;
            default:
                this.debug(`Batch event: ${event}`, logEntry);
        }
    }

    /**
     * Logs contact processing events
     * @param {string} subscriberKey - Subscriber key
     * @param {string} event - Event type
     * @param {Object} context - Event context
     */
    logContactEvent(subscriberKey, event, context = {}) {
        const logEntry = {
            type: 'contact',
            subscriberKey,
            event,
            timestamp: new Date().toISOString(),
            context: this.sanitizeContext(context)
        };

        this.addLogEntry(logEntry);

        switch (event) {
            case 'converted_time_calculated':
                this.debug('ConvertedTime calculated for contact', {
                    subscriberKey,
                    convertedTime: context.convertedTime,
                    originalTime: context.originalTime
                });
                break;
            case 'converted_time_updated':
                this.info('ConvertedTime updated for contact', {
                    subscriberKey,
                    convertedTime: context.convertedTime,
                    attempts: context.attempts
                });
                break;
            case 'update_failed':
                this.error('ConvertedTime update failed for contact', {
                    subscriberKey,
                    error: context.error,
                    attempts: context.attempts
                });
                break;
            default:
                this.debug(`Contact event: ${event}`, {
                    subscriberKey,
                    ...context
                });
        }
    }

    /**
     * Gets operation metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime.getTime();
        
        return {
            ...this.metrics,
            uptime,
            successRate: this.metrics.totalOperations > 0 
                ? (this.metrics.successfulOperations / this.metrics.totalOperations * 100).toFixed(2) + '%'
                : '0%',
            operationsPerMinute: this.metrics.totalOperations > 0
                ? ((this.metrics.totalOperations / uptime) * 60000).toFixed(2)
                : '0'
        };
    }

    /**
     * Gets recent log entries
     * @param {number} count - Number of entries to return
     * @returns {Array} Recent log entries
     */
    getRecentLogs(count = 50) {
        return this.recentLogs.slice(-count);
    }

    /**
     * Clears metrics and logs
     */
    clearMetrics() {
        this.metrics = {
            operations: {},
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            averageResponseTime: 0,
            startTime: new Date()
        };
        this.recentLogs = [];
    }

    // Logging level methods
    debug(message, data = {}) {
        if (this.shouldLog('debug')) {
            this.baseLogger.debug(this.formatMessage(message, data));
        }
    }

    info(message, data = {}) {
        if (this.shouldLog('info')) {
            this.baseLogger.info(this.formatMessage(message, data));
        }
    }

    warn(message, data = {}) {
        if (this.shouldLog('warn')) {
            this.baseLogger.warn(this.formatMessage(message, data));
        }
    }

    error(message, data = {}) {
        if (this.shouldLog('error')) {
            this.baseLogger.error(this.formatMessage(message, data));
        }
    }

    // Private methods

    generateOperationId() {
        return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    sanitizeContext(context) {
        if (!this.config.includeContext) {
            return {};
        }

        // Remove sensitive information
        const sanitized = { ...context };
        const sensitiveKeys = ['password', 'token', 'secret', 'authorization'];
        
        for (const key of Object.keys(sanitized)) {
            if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()))) {
                sanitized[key] = '[REDACTED]';
            }
        }

        return sanitized;
    }

    sanitizeResult(result) {
        // Limit result size to prevent large logs
        const resultStr = JSON.stringify(result);
        if (resultStr.length > 1000) {
            return { ...result, _truncated: true, _originalSize: resultStr.length };
        }
        return result;
    }

    addLogEntry(entry) {
        if (this.recentLogs.length >= this.config.maxLogEntries) {
            this.recentLogs.shift();
        }
        this.recentLogs.push(entry);
    }

    updateMetrics(operation, success, duration) {
        if (!this.config.enableMetrics) {
            return;
        }

        this.metrics.totalOperations++;
        
        if (success) {
            this.metrics.successfulOperations++;
        } else {
            this.metrics.failedOperations++;
        }

        // Update operation-specific metrics
        if (!this.metrics.operations[operation]) {
            this.metrics.operations[operation] = {
                total: 0,
                successful: 0,
                failed: 0,
                totalDuration: 0,
                averageDuration: 0
            };
        }

        const opMetrics = this.metrics.operations[operation];
        opMetrics.total++;
        opMetrics.totalDuration += duration;
        opMetrics.averageDuration = opMetrics.totalDuration / opMetrics.total;

        if (success) {
            opMetrics.successful++;
        } else {
            opMetrics.failed++;
        }

        // Update overall average response time
        const totalDuration = Object.values(this.metrics.operations)
            .reduce((sum, op) => sum + op.totalDuration, 0);
        this.metrics.averageResponseTime = totalDuration / this.metrics.totalOperations;
    }

    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        const currentLevelIndex = levels.indexOf(this.config.logLevel);
        const messageLevelIndex = levels.indexOf(level);
        
        return messageLevelIndex >= currentLevelIndex;
    }

    formatMessage(message, data) {
        let formatted = message;
        
        if (this.config.includeTimestamps) {
            formatted = `[${new Date().toISOString()}] ${formatted}`;
        }

        if (Object.keys(data).length > 0) {
            formatted += ` ${JSON.stringify(data)}`;
        }

        return formatted;
    }
}

module.exports = DataExtensionOperationLogger;