/**
 * Structured Logger System
 * Provides consistent logging format for all operations with different log levels
 * Implements log aggregation for monitoring and debugging
 */

const fs = require('fs');
const path = require('path');

/**
 * Structured Logger class that provides centralized logging with consistent format
 */
class StructuredLogger {
    constructor(config = {}) {
        this.config = {
            logLevel: config.logLevel || 'info', // debug, info, warn, error
            enableConsoleOutput: config.enableConsoleOutput !== false,
            enableFileOutput: config.enableFileOutput || false,
            logDirectory: config.logDirectory || './logs',
            maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
            maxFiles: config.maxFiles || 5,
            enableMetrics: config.enableMetrics !== false,
            enableAggregation: config.enableAggregation !== false,
            serviceName: config.serviceName || 'send-time-optimization',
            environment: config.environment || process.env.NODE_ENV || 'development',
            ...config
        };

        // Log levels with numeric values for comparison
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };

        // Metrics tracking
        this.metrics = {
            totalLogs: 0,
            logsByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
            logsByCategory: {},
            startTime: new Date(),
            lastLogTime: null,
            errorsByType: {},
            performanceMetrics: {
                averageLogTime: 0,
                totalLogTime: 0,
                slowestLog: null,
                fastestLog: null
            }
        };

        // Log aggregation storage
        this.logBuffer = [];
        this.maxBufferSize = config.maxBufferSize || 1000;

        // Initialize file logging if enabled
        if (this.config.enableFileOutput) {
            this._initializeFileLogging();
        }

        // Bind methods to preserve context
        this.debug = this.debug.bind(this);
        this.info = this.info.bind(this);
        this.warn = this.warn.bind(this);
        this.error = this.error.bind(this);
    }

    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {Object} context - Additional context data
     * @param {string} category - Log category for aggregation
     */
    debug(message, context = {}, category = 'general') {
        this._log('debug', message, context, category);
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} context - Additional context data
     * @param {string} category - Log category for aggregation
     */
    info(message, context = {}, category = 'general') {
        this._log('info', message, context, category);
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} context - Additional context data
     * @param {string} category - Log category for aggregation
     */
    warn(message, context = {}, category = 'general') {
        this._log('warn', message, context, category);
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Object|Error} context - Additional context data or Error object
     * @param {string} category - Log category for aggregation
     */
    error(message, context = {}, category = 'general') {
        // Handle Error objects
        if (context instanceof Error) {
            context = {
                error: context.message,
                stack: context.stack,
                name: context.name,
                ...context
            };
        }

        this._log('error', message, context, category);
    }

    /**
     * Log with custom level
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} context - Additional context data
     * @param {string} category - Log category for aggregation
     */
    log(level, message, context = {}, category = 'general') {
        this._log(level, message, context, category);
    }

    /**
     * Create a child logger with additional context
     * @param {Object} childContext - Context to add to all logs from this child
     * @param {string} childCategory - Default category for child logs
     * @returns {Object} Child logger instance
     */
    child(childContext = {}, childCategory = null) {
        const parentLogger = this;
        
        return {
            debug: (message, context = {}, category = childCategory || 'general') => {
                parentLogger.debug(message, { ...childContext, ...context }, category);
            },
            info: (message, context = {}, category = childCategory || 'general') => {
                parentLogger.info(message, { ...childContext, ...context }, category);
            },
            warn: (message, context = {}, category = childCategory || 'general') => {
                parentLogger.warn(message, { ...childContext, ...context }, category);
            },
            error: (message, context = {}, category = childCategory || 'general') => {
                parentLogger.error(message, { ...childContext, ...context }, category);
            },
            log: (level, message, context = {}, category = childCategory || 'general') => {
                parentLogger.log(level, message, { ...childContext, ...context }, category);
            }
        };
    }

    /**
     * Log performance metrics
     * @param {string} operation - Operation name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} context - Additional context
     */
    logPerformance(operation, duration, context = {}) {
        const performanceContext = {
            operation,
            duration: `${duration}ms`,
            performanceCategory: 'timing',
            ...context
        };

        // Log as warning if operation is slow
        if (duration > 5000) {
            this.warn(`Slow operation detected: ${operation}`, performanceContext, 'performance');
        } else {
            this.debug(`Performance: ${operation}`, performanceContext, 'performance');
        }

        // Update performance metrics
        this._updatePerformanceMetrics(operation, duration);
    }

    /**
     * Log structured event
     * @param {string} eventType - Type of event
     * @param {string} eventName - Name of the event
     * @param {Object} eventData - Event data
     * @param {string} level - Log level (default: info)
     */
    logEvent(eventType, eventName, eventData = {}, level = 'info') {
        const eventContext = {
            eventType,
            eventName,
            eventData,
            eventTimestamp: new Date().toISOString()
        };

        this._log(level, `Event: ${eventType}.${eventName}`, eventContext, 'events');
    }

    /**
     * Log API request/response
     * @param {string} method - HTTP method
     * @param {string} url - Request URL
     * @param {number} statusCode - Response status code
     * @param {number} duration - Request duration in ms
     * @param {Object} context - Additional context
     */
    logApiCall(method, url, statusCode, duration, context = {}) {
        const apiContext = {
            method,
            url: this._sanitizeUrl(url),
            statusCode,
            duration: `${duration}ms`,
            success: statusCode >= 200 && statusCode < 300,
            ...context
        };

        const level = statusCode >= 400 ? 'error' : statusCode >= 300 ? 'warn' : 'info';
        this._log(level, `API ${method} ${url}`, apiContext, 'api');
    }

    /**
     * Get current metrics
     * @returns {Object} Current logging metrics
     */
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime.getTime();
        
        return {
            ...this.metrics,
            uptime: `${Math.round(uptime / 1000)}s`,
            logsPerSecond: this.metrics.totalLogs > 0 
                ? (this.metrics.totalLogs / (uptime / 1000)).toFixed(2)
                : '0',
            bufferSize: this.logBuffer.length,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get recent logs from buffer
     * @param {number} limit - Maximum number of logs to return
     * @param {string} level - Filter by log level
     * @param {string} category - Filter by category
     * @returns {Array} Recent log entries
     */
    getRecentLogs(limit = 100, level = null, category = null) {
        let logs = this.logBuffer.slice(-limit);

        if (level) {
            logs = logs.filter(log => log.level === level);
        }

        if (category) {
            logs = logs.filter(log => log.category === category);
        }

        return logs;
    }

    /**
     * Get logs by category
     * @param {string} category - Category to filter by
     * @param {number} limit - Maximum number of logs
     * @returns {Array} Logs for the specified category
     */
    getLogsByCategory(category, limit = 100) {
        return this.logBuffer
            .filter(log => log.category === category)
            .slice(-limit);
    }

    /**
     * Get error summary
     * @returns {Object} Error summary with counts and types
     */
    getErrorSummary() {
        const errorLogs = this.logBuffer.filter(log => log.level === 'error');
        const errorsByCategory = {};
        const recentErrors = errorLogs.slice(-10);

        errorLogs.forEach(log => {
            errorsByCategory[log.category] = (errorsByCategory[log.category] || 0) + 1;
        });

        return {
            totalErrors: errorLogs.length,
            errorsByCategory,
            errorsByType: this.metrics.errorsByType,
            recentErrors: recentErrors.map(log => ({
                timestamp: log.timestamp,
                message: log.message,
                category: log.category,
                context: log.context
            }))
        };
    }

    /**
     * Clear all logs and reset metrics
     */
    clear() {
        this.logBuffer = [];
        this.metrics = {
            totalLogs: 0,
            logsByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
            logsByCategory: {},
            startTime: new Date(),
            lastLogTime: null,
            errorsByType: {},
            performanceMetrics: {
                averageLogTime: 0,
                totalLogTime: 0,
                slowestLog: null,
                fastestLog: null
            }
        };
    }

    /**
     * Flush logs to file (if file logging is enabled)
     */
    flush() {
        if (this.config.enableFileOutput && this.logBuffer.length > 0) {
            this._writeLogsToFile();
        }
    }

    /**
     * Core logging method
     * @private
     */
    _log(level, message, context, category) {
        const startTime = Date.now();

        // Check if we should log this level
        if (!this._shouldLog(level)) {
            return;
        }

        // Create structured log entry
        const logEntry = this._createLogEntry(level, message, context, category);

        // Add to buffer for aggregation
        if (this.config.enableAggregation) {
            this._addToBuffer(logEntry);
        }

        // Output to console
        if (this.config.enableConsoleOutput) {
            this._outputToConsole(logEntry);
        }

        // Output to file
        if (this.config.enableFileOutput) {
            this._outputToFile(logEntry);
        }

        // Update metrics
        if (this.config.enableMetrics) {
            this._updateMetrics(level, category, Date.now() - startTime);
        }
    }

    /**
     * Create structured log entry
     * @private
     */
    _createLogEntry(level, message, context, category) {
        return {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            service: this.config.serviceName,
            environment: this.config.environment,
            category,
            message,
            context: this._sanitizeContext(context),
            pid: process.pid,
            hostname: require('os').hostname(),
            version: process.env.npm_package_version || '1.0.0'
        };
    }

    /**
     * Check if log level should be output
     * @private
     */
    _shouldLog(level) {
        const configLevel = this.logLevels[this.config.logLevel] || 1;
        const messageLevel = this.logLevels[level] || 1;
        return messageLevel >= configLevel;
    }

    /**
     * Add log entry to buffer
     * @private
     */
    _addToBuffer(logEntry) {
        this.logBuffer.push(logEntry);

        // Trim buffer if it exceeds max size
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
        }
    }

    /**
     * Output log to console
     * @private
     */
    _outputToConsole(logEntry) {
        const formattedMessage = this._formatForConsole(logEntry);

        switch (logEntry.level.toLowerCase()) {
            case 'debug':
                console.debug(formattedMessage);
                break;
            case 'info':
                console.info(formattedMessage);
                break;
            case 'warn':
                console.warn(formattedMessage);
                break;
            case 'error':
                console.error(formattedMessage);
                break;
            default:
                console.log(formattedMessage);
        }
    }

    /**
     * Format log entry for console output
     * @private
     */
    _formatForConsole(logEntry) {
        const timestamp = logEntry.timestamp;
        const level = logEntry.level.padEnd(5);
        const category = logEntry.category.padEnd(12);
        const message = logEntry.message;

        let formatted = `[${timestamp}] ${level} [${category}] ${message}`;

        // Add context if present and not empty
        if (logEntry.context && Object.keys(logEntry.context).length > 0) {
            formatted += ` ${JSON.stringify(logEntry.context)}`;
        }

        return formatted;
    }

    /**
     * Output log to file
     * @private
     */
    _outputToFile(logEntry) {
        if (!this.logFileStream) {
            return;
        }

        const logLine = JSON.stringify(logEntry) + '\n';
        this.logFileStream.write(logLine);

        // Check if we need to rotate the log file
        this._checkLogRotation();
    }

    /**
     * Initialize file logging
     * @private
     */
    _initializeFileLogging() {
        try {
            // Create log directory if it doesn't exist
            if (!fs.existsSync(this.config.logDirectory)) {
                fs.mkdirSync(this.config.logDirectory, { recursive: true });
            }

            // Create log file stream
            const logFileName = `${this.config.serviceName}-${new Date().toISOString().split('T')[0]}.log`;
            const logFilePath = path.join(this.config.logDirectory, logFileName);
            
            this.logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });
            this.currentLogFile = logFilePath;
            
        } catch (error) {
            console.error('Failed to initialize file logging:', error);
            this.config.enableFileOutput = false;
        }
    }

    /**
     * Check if log file needs rotation
     * @private
     */
    _checkLogRotation() {
        if (!this.currentLogFile || !fs.existsSync(this.currentLogFile)) {
            return;
        }

        const stats = fs.statSync(this.currentLogFile);
        if (stats.size > this.config.maxFileSize) {
            this._rotateLogFile();
        }
    }

    /**
     * Rotate log file
     * @private
     */
    _rotateLogFile() {
        try {
            // Close current stream
            if (this.logFileStream) {
                this.logFileStream.end();
            }

            // Create new log file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFileName = `${this.config.serviceName}-${timestamp}.log`;
            const logFilePath = path.join(this.config.logDirectory, logFileName);
            
            this.logFileStream = fs.createWriteStream(logFilePath, { flags: 'a' });
            this.currentLogFile = logFilePath;

            // Clean up old log files
            this._cleanupOldLogFiles();
            
        } catch (error) {
            console.error('Failed to rotate log file:', error);
        }
    }

    /**
     * Clean up old log files
     * @private
     */
    _cleanupOldLogFiles() {
        try {
            const files = fs.readdirSync(this.config.logDirectory)
                .filter(file => file.startsWith(this.config.serviceName) && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.config.logDirectory, file),
                    mtime: fs.statSync(path.join(this.config.logDirectory, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);

            // Remove old files if we exceed maxFiles
            if (files.length > this.config.maxFiles) {
                const filesToDelete = files.slice(this.config.maxFiles);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
        } catch (error) {
            console.error('Failed to cleanup old log files:', error);
        }
    }

    /**
     * Sanitize context data
     * @private
     */
    _sanitizeContext(context) {
        if (!context || typeof context !== 'object') {
            return context;
        }

        const sanitized = { ...context };
        const sensitiveKeys = ['password', 'token', 'secret', 'authorization', 'key', 'auth'];

        for (const [key, value] of Object.entries(sanitized)) {
            if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
                sanitized[key] = '[REDACTED]';
            } else if (typeof value === 'string' && value.length > 1000) {
                sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
            }
        }

        return sanitized;
    }

    /**
     * Sanitize URL for logging
     * @private
     */
    _sanitizeUrl(url) {
        try {
            const urlObj = new URL(url);
            // Remove sensitive query parameters
            const sensitiveParams = ['token', 'key', 'secret', 'password', 'auth'];
            
            for (const param of sensitiveParams) {
                if (urlObj.searchParams.has(param)) {
                    urlObj.searchParams.set(param, '[REDACTED]');
                }
            }
            
            return urlObj.toString();
        } catch {
            return url;
        }
    }

    /**
     * Update logging metrics
     * @private
     */
    _updateMetrics(level, category, logTime) {
        this.metrics.totalLogs++;
        this.metrics.logsByLevel[level]++;
        this.metrics.logsByCategory[category] = (this.metrics.logsByCategory[category] || 0) + 1;
        this.metrics.lastLogTime = new Date();

        // Update performance metrics
        this.metrics.performanceMetrics.totalLogTime += logTime;
        this.metrics.performanceMetrics.averageLogTime = 
            this.metrics.performanceMetrics.totalLogTime / this.metrics.totalLogs;

        if (!this.metrics.performanceMetrics.fastestLog || logTime < this.metrics.performanceMetrics.fastestLog) {
            this.metrics.performanceMetrics.fastestLog = logTime;
        }

        if (!this.metrics.performanceMetrics.slowestLog || logTime > this.metrics.performanceMetrics.slowestLog) {
            this.metrics.performanceMetrics.slowestLog = logTime;
        }

        // Track error types
        if (level === 'error' && category) {
            this.metrics.errorsByType[category] = (this.metrics.errorsByType[category] || 0) + 1;
        }
    }

    /**
     * Update performance metrics for operations
     * @private
     */
    _updatePerformanceMetrics(operation, duration) {
        if (!this.metrics.performanceMetrics.operations) {
            this.metrics.performanceMetrics.operations = {};
        }

        if (!this.metrics.performanceMetrics.operations[operation]) {
            this.metrics.performanceMetrics.operations[operation] = {
                count: 0,
                totalTime: 0,
                averageTime: 0,
                minTime: null,
                maxTime: null
            };
        }

        const opMetrics = this.metrics.performanceMetrics.operations[operation];
        opMetrics.count++;
        opMetrics.totalTime += duration;
        opMetrics.averageTime = opMetrics.totalTime / opMetrics.count;

        if (opMetrics.minTime === null || duration < opMetrics.minTime) {
            opMetrics.minTime = duration;
        }

        if (opMetrics.maxTime === null || duration > opMetrics.maxTime) {
            opMetrics.maxTime = duration;
        }
    }

    /**
     * Write buffered logs to file
     * @private
     */
    _writeLogsToFile() {
        if (!this.logFileStream || this.logBuffer.length === 0) {
            return;
        }

        const logsToWrite = this.logBuffer.splice(0);
        const logLines = logsToWrite.map(log => JSON.stringify(log)).join('\n') + '\n';
        
        this.logFileStream.write(logLines);
    }
}

module.exports = StructuredLogger;