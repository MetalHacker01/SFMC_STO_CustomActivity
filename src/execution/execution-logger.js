/**
 * Execution Logger
 * Comprehensive logging for each contact processing step
 * Implements execution statistics tracking and performance monitoring
 */

/**
 * Execution Logger class that provides structured logging and monitoring
 */
class ExecutionLogger {
    constructor(baseLogger = console, config = {}) {
        this.baseLogger = baseLogger;
        this.config = {
            logLevel: config.logLevel || 'info', // debug, info, warn, error
            enablePerformanceLogging: config.enablePerformanceLogging !== false,
            enableStatisticsTracking: config.enableStatisticsTracking !== false,
            maxLogEntries: config.maxLogEntries || 1000,
            logFormat: config.logFormat || 'structured', // structured, simple
            ...config
        };

        // Execution statistics
        this.executionStats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            minProcessingTime: null,
            maxProcessingTime: null,
            lastExecutionTime: null,
            executionsByHour: {},
            errorsByType: {},
            performanceMetrics: {
                timezoneCalculations: { count: 0, totalTime: 0, averageTime: 0 },
                holidayChecks: { count: 0, totalTime: 0, averageTime: 0 },
                timeWindowProcessing: { count: 0, totalTime: 0, averageTime: 0 },
                dataExtensionUpdates: { count: 0, totalTime: 0, averageTime: 0 }
            }
        };

        // Log entries for detailed tracking
        this.logEntries = [];

        // Performance timers
        this.activeTimers = new Map();
    }

    /**
     * Log contact processing start
     * @param {string} processingId - Unique processing identifier
     * @param {Object} contact - Contact data
     * @param {Object} activityConfig - Activity configuration
     * @param {Object} context - Processing context
     */
    logProcessingStart(processingId, contact, activityConfig, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'info',
            event: 'processing_start',
            processingId,
            subscriberKey: contact.subscriberKey,
            geosegment: contact.geosegment,
            config: {
                skipWeekends: activityConfig.skipWeekends,
                skipHolidays: activityConfig.skipHolidays,
                timeWindowsCount: activityConfig.timeWindows?.length || 0
            },
            context: {
                hasDataExtensionKey: !!context.dataExtensionKey,
                journeyId: context.journeyId,
                activityId: context.activityId
            }
        };

        this._writeLog(logEntry);
        this._startTimer(processingId, 'total_processing');
        
        this.executionStats.totalExecutions++;
        this._updateHourlyStats();
    }

    /**
     * Log contact processing completion
     * @param {string} processingId - Unique processing identifier
     * @param {Object} result - Processing result
     */
    logProcessingComplete(processingId, result) {
        const processingTime = this._endTimer(processingId, 'total_processing');
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: result.success ? 'info' : 'error',
            event: 'processing_complete',
            processingId,
            subscriberKey: result.subscriberKey,
            success: result.success,
            processingTime: `${processingTime}ms`,
            result: {
                convertedTime: result.convertedTime,
                adjustmentsCount: result.adjustments?.length || 0,
                dataExtensionUpdated: result.dataExtensionUpdate?.successful || false
            }
        };

        if (!result.success) {
            logEntry.error = result.error;
            this.executionStats.failedExecutions++;
            this._trackError(result.error);
        } else {
            this.executionStats.successfulExecutions++;
        }

        this._writeLog(logEntry);
        this._updateProcessingTimeStats(processingTime);
    }

    /**
     * Log timezone calculation step
     * @param {string} processingId - Processing identifier
     * @param {string} countryCode - Country code being processed
     * @param {Object} result - Timezone calculation result
     */
    logTimezoneCalculation(processingId, countryCode, result) {
        const stepTime = this._getStepTime(processingId, 'timezone_calculation');
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: result.success ? 'debug' : 'warn',
            event: 'timezone_calculation',
            processingId,
            countryCode,
            success: result.success,
            stepTime: stepTime ? `${stepTime}ms` : null,
            details: {
                offsetApplied: result.offsetApplied,
                fallbackUsed: result.fallbackUsed,
                timezoneInfo: result.timezoneInfo
            }
        };

        if (!result.success) {
            logEntry.error = result.error;
        }

        this._writeLog(logEntry);
        
        if (stepTime) {
            this._updatePerformanceMetric('timezoneCalculations', stepTime);
        }
    }

    /**
     * Log holiday checking step
     * @param {string} processingId - Processing identifier
     * @param {string} countryCode - Country code
     * @param {Object} result - Holiday check result
     */
    logHolidayCheck(processingId, countryCode, result) {
        const stepTime = this._getStepTime(processingId, 'holiday_check');
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'debug',
            event: 'holiday_check',
            processingId,
            countryCode,
            stepTime: stepTime ? `${stepTime}ms` : null,
            details: {
                holidaysChecked: result.holidaysChecked?.length || 0,
                exclusionApplied: result.holidayExclusionApplied,
                daysAdjusted: result.daysAdjusted || 0
            }
        };

        if (result.warning) {
            logEntry.level = 'warn';
            logEntry.warning = result.warning;
        }

        this._writeLog(logEntry);
        
        if (stepTime) {
            this._updatePerformanceMetric('holidayChecks', stepTime);
        }
    }

    /**
     * Log time window processing step
     * @param {string} processingId - Processing identifier
     * @param {Array} timeWindows - Time windows configuration
     * @param {Object} result - Time window processing result
     */
    logTimeWindowProcessing(processingId, timeWindows, result) {
        const stepTime = this._getStepTime(processingId, 'time_window_processing');
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: result.success ? 'debug' : 'warn',
            event: 'time_window_processing',
            processingId,
            success: result.success,
            stepTime: stepTime ? `${stepTime}ms` : null,
            details: {
                timeWindowsCount: timeWindows.length,
                selectedWindow: result.selectedWindow,
                windowAdjusted: result.windowAdjusted
            }
        };

        if (!result.success) {
            logEntry.error = result.error;
        }

        this._writeLog(logEntry);
        
        if (stepTime) {
            this._updatePerformanceMetric('timeWindowProcessing', stepTime);
        }
    }

    /**
     * Log data extension update step
     * @param {string} processingId - Processing identifier
     * @param {string} subscriberKey - Subscriber key
     * @param {Object} result - Update result
     */
    logDataExtensionUpdate(processingId, subscriberKey, result) {
        const stepTime = this._getStepTime(processingId, 'data_extension_update');
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: result.success ? 'debug' : 'warn',
            event: 'data_extension_update',
            processingId,
            subscriberKey,
            success: result.success,
            skipped: result.skipped,
            stepTime: stepTime ? `${stepTime}ms` : null
        };

        if (!result.success && !result.skipped) {
            logEntry.error = result.error;
        }

        this._writeLog(logEntry);
        
        if (stepTime) {
            this._updatePerformanceMetric('dataExtensionUpdates', stepTime);
        }
    }

    /**
     * Log performance metrics for a specific operation
     * @param {string} processingId - Processing identifier
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} metadata - Additional metadata
     */
    logPerformanceMetric(processingId, operation, duration, metadata = {}) {
        if (!this.config.enablePerformanceLogging) {
            return;
        }

        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'debug',
            event: 'performance_metric',
            processingId,
            operation,
            duration: `${duration}ms`,
            metadata
        };

        // Add performance warnings for slow operations
        if (duration > 5000) { // 5 seconds
            logEntry.level = 'warn';
            logEntry.warning = 'Slow operation detected';
        }

        this._writeLog(logEntry);
    }

    /**
     * Log error with detailed context
     * @param {string} processingId - Processing identifier
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Error context
     */
    logError(processingId, error, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            event: 'processing_error',
            processingId,
            error: error.message || error,
            stack: error.stack,
            context
        };

        this._writeLog(logEntry);
        this._trackError(error.message || error);
    }

    /**
     * Log warning with context
     * @param {string} processingId - Processing identifier
     * @param {string} message - Warning message
     * @param {Object} context - Warning context
     */
    logWarning(processingId, message, context = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'warn',
            event: 'processing_warning',
            processingId,
            message,
            context
        };

        this._writeLog(logEntry);
    }

    /**
     * Start a timer for a specific step
     * @param {string} processingId - Processing identifier
     * @param {string} stepName - Step name
     */
    startStepTimer(processingId, stepName) {
        this._startTimer(processingId, stepName);
    }

    /**
     * End a timer for a specific step
     * @param {string} processingId - Processing identifier
     * @param {string} stepName - Step name
     * @returns {number} Duration in milliseconds
     */
    endStepTimer(processingId, stepName) {
        return this._endTimer(processingId, stepName);
    }

    /**
     * Get current execution statistics
     * @returns {Object} Current statistics
     */
    getExecutionStats() {
        return {
            ...this.executionStats,
            timestamp: new Date().toISOString(),
            logEntriesCount: this.logEntries.length,
            activeTimersCount: this.activeTimers.size
        };
    }

    /**
     * Get recent log entries
     * @param {number} limit - Maximum number of entries to return
     * @param {string} level - Filter by log level
     * @returns {Array} Recent log entries
     */
    getRecentLogEntries(limit = 100, level = null) {
        let entries = this.logEntries.slice(-limit);
        
        if (level) {
            entries = entries.filter(entry => entry.level === level);
        }
        
        return entries;
    }

    /**
     * Reset all statistics and logs
     */
    reset() {
        this.executionStats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalProcessingTime: 0,
            averageProcessingTime: 0,
            minProcessingTime: null,
            maxProcessingTime: null,
            lastExecutionTime: null,
            executionsByHour: {},
            errorsByType: {},
            performanceMetrics: {
                timezoneCalculations: { count: 0, totalTime: 0, averageTime: 0 },
                holidayChecks: { count: 0, totalTime: 0, averageTime: 0 },
                timeWindowProcessing: { count: 0, totalTime: 0, averageTime: 0 },
                dataExtensionUpdates: { count: 0, totalTime: 0, averageTime: 0 }
            }
        };
        
        this.logEntries = [];
        this.activeTimers.clear();
    }

    /**
     * Write log entry
     * @private
     */
    _writeLog(logEntry) {
        // Add to internal log entries
        this.logEntries.push(logEntry);
        
        // Trim log entries if exceeding max
        if (this.logEntries.length > this.config.maxLogEntries) {
            this.logEntries = this.logEntries.slice(-this.config.maxLogEntries);
        }

        // Write to base logger based on level and configuration
        if (this._shouldLog(logEntry.level)) {
            const formattedMessage = this._formatLogMessage(logEntry);
            
            switch (logEntry.level) {
                case 'error':
                    this.baseLogger.error(formattedMessage);
                    break;
                case 'warn':
                    this.baseLogger.warn(formattedMessage);
                    break;
                case 'info':
                    this.baseLogger.info(formattedMessage);
                    break;
                case 'debug':
                    this.baseLogger.debug ? this.baseLogger.debug(formattedMessage) : this.baseLogger.log(formattedMessage);
                    break;
                default:
                    this.baseLogger.log(formattedMessage);
            }
        }
    }

    /**
     * Check if log level should be written
     * @private
     */
    _shouldLog(level) {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        const configLevel = levels[this.config.logLevel] || 1;
        const messageLevel = levels[level] || 1;
        
        return messageLevel >= configLevel;
    }

    /**
     * Format log message based on configuration
     * @private
     */
    _formatLogMessage(logEntry) {
        if (this.config.logFormat === 'simple') {
            return `[${logEntry.timestamp}] ${logEntry.level.toUpperCase()}: ${logEntry.event} - ${logEntry.processingId || 'N/A'}`;
        }
        
        // Structured format (default)
        return JSON.stringify(logEntry, null, 2);
    }

    /**
     * Start a timer
     * @private
     */
    _startTimer(processingId, stepName) {
        const timerKey = `${processingId}_${stepName}`;
        this.activeTimers.set(timerKey, Date.now());
    }

    /**
     * End a timer and return duration
     * @private
     */
    _endTimer(processingId, stepName) {
        const timerKey = `${processingId}_${stepName}`;
        const startTime = this.activeTimers.get(timerKey);
        
        if (startTime) {
            this.activeTimers.delete(timerKey);
            return Date.now() - startTime;
        }
        
        return null;
    }

    /**
     * Get step time if timer exists
     * @private
     */
    _getStepTime(processingId, stepName) {
        const timerKey = `${processingId}_${stepName}`;
        const startTime = this.activeTimers.get(timerKey);
        
        if (startTime) {
            return Date.now() - startTime;
        }
        
        return null;
    }

    /**
     * Update processing time statistics
     * @private
     */
    _updateProcessingTimeStats(processingTime) {
        this.executionStats.totalProcessingTime += processingTime;
        this.executionStats.averageProcessingTime = Math.round(
            this.executionStats.totalProcessingTime / this.executionStats.totalExecutions
        );
        this.executionStats.lastExecutionTime = processingTime;

        if (this.executionStats.minProcessingTime === null || processingTime < this.executionStats.minProcessingTime) {
            this.executionStats.minProcessingTime = processingTime;
        }

        if (this.executionStats.maxProcessingTime === null || processingTime > this.executionStats.maxProcessingTime) {
            this.executionStats.maxProcessingTime = processingTime;
        }
    }

    /**
     * Update hourly execution statistics
     * @private
     */
    _updateHourlyStats() {
        const hour = new Date().getHours();
        this.executionStats.executionsByHour[hour] = (this.executionStats.executionsByHour[hour] || 0) + 1;
    }

    /**
     * Track error by type
     * @private
     */
    _trackError(errorMessage) {
        // Extract error type from message
        const errorType = this._extractErrorType(errorMessage);
        this.executionStats.errorsByType[errorType] = (this.executionStats.errorsByType[errorType] || 0) + 1;
    }

    /**
     * Extract error type from error message
     * @private
     */
    _extractErrorType(errorMessage) {
        if (typeof errorMessage !== 'string') {
            return 'unknown';
        }

        if (errorMessage.includes('timezone')) return 'timezone_error';
        if (errorMessage.includes('holiday')) return 'holiday_error';
        if (errorMessage.includes('time window')) return 'time_window_error';
        if (errorMessage.includes('data extension')) return 'data_extension_error';
        if (errorMessage.includes('validation')) return 'validation_error';
        if (errorMessage.includes('timeout')) return 'timeout_error';
        
        return 'general_error';
    }

    /**
     * Update performance metric
     * @private
     */
    _updatePerformanceMetric(metricName, duration) {
        if (!this.executionStats.performanceMetrics[metricName]) {
            this.executionStats.performanceMetrics[metricName] = { count: 0, totalTime: 0, averageTime: 0 };
        }

        const metric = this.executionStats.performanceMetrics[metricName];
        metric.count++;
        metric.totalTime += duration;
        metric.averageTime = Math.round(metric.totalTime / metric.count);
    }
}

module.exports = ExecutionLogger;