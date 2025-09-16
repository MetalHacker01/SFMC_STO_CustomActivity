/**
 * Logger Factory
 * Provides centralized logger creation and configuration
 * Ensures consistent logging setup across all application components
 */

const StructuredLogger = require('./structured-logger');

/**
 * Logger Factory class for creating and managing logger instances
 */
class LoggerFactory {
    constructor() {
        this.loggers = new Map();
        this.defaultConfig = this._getDefaultConfig();
    }

    /**
     * Get or create a logger instance
     * @param {string} name - Logger name/identifier
     * @param {Object} config - Logger configuration (optional)
     * @returns {StructuredLogger} Logger instance
     */
    getLogger(name = 'default', config = {}) {
        const loggerKey = this._getLoggerKey(name, config);
        
        if (this.loggers.has(loggerKey)) {
            return this.loggers.get(loggerKey);
        }

        const mergedConfig = this._mergeConfig(config);
        const logger = new StructuredLogger({
            ...mergedConfig,
            serviceName: `${mergedConfig.serviceName}-${name}`
        });

        this.loggers.set(loggerKey, logger);
        return logger;
    }

    /**
     * Create a logger for a specific component
     * @param {string} component - Component name
     * @param {Object} config - Component-specific configuration
     * @returns {StructuredLogger} Component logger
     */
    createComponentLogger(component, config = {}) {
        return this.getLogger(component, {
            ...config,
            defaultCategory: component
        });
    }

    /**
     * Create a logger for execution operations
     * @param {Object} config - Execution logger configuration
     * @returns {StructuredLogger} Execution logger
     */
    createExecutionLogger(config = {}) {
        return this.getLogger('execution', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'debug'
        });
    }

    /**
     * Create a logger for data extension operations
     * @param {Object} config - Data extension logger configuration
     * @returns {StructuredLogger} Data extension logger
     */
    createDataExtensionLogger(config = {}) {
        return this.getLogger('dataextension', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'info'
        });
    }

    /**
     * Create a logger for API operations
     * @param {Object} config - API logger configuration
     * @returns {StructuredLogger} API logger
     */
    createApiLogger(config = {}) {
        return this.getLogger('api', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'info'
        });
    }

    /**
     * Create a logger for holiday operations
     * @param {Object} config - Holiday logger configuration
     * @returns {StructuredLogger} Holiday logger
     */
    createHolidayLogger(config = {}) {
        return this.getLogger('holiday', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'info'
        });
    }

    /**
     * Create a logger for timezone operations
     * @param {Object} config - Timezone logger configuration
     * @returns {StructuredLogger} Timezone logger
     */
    createTimezoneLogger(config = {}) {
        return this.getLogger('timezone', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'debug'
        });
    }

    /**
     * Create a logger for time window operations
     * @param {Object} config - Time window logger configuration
     * @returns {StructuredLogger} Time window logger
     */
    createTimeWindowLogger(config = {}) {
        return this.getLogger('timewindow', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'debug'
        });
    }

    /**
     * Create a logger for lifecycle operations
     * @param {Object} config - Lifecycle logger configuration
     * @returns {StructuredLogger} Lifecycle logger
     */
    createLifecycleLogger(config = {}) {
        return this.getLogger('lifecycle', {
            ...config,
            enableMetrics: true,
            enableAggregation: true,
            logLevel: config.logLevel || 'info'
        });
    }

    /**
     * Update default configuration for all new loggers
     * @param {Object} config - New default configuration
     */
    updateDefaultConfig(config) {
        this.defaultConfig = this._mergeConfig(config);
    }

    /**
     * Get all active loggers
     * @returns {Map} Map of all active logger instances
     */
    getAllLoggers() {
        return new Map(this.loggers);
    }

    /**
     * Get aggregated metrics from all loggers
     * @returns {Object} Aggregated metrics
     */
    getAggregatedMetrics() {
        const aggregated = {
            totalLoggers: this.loggers.size,
            totalLogs: 0,
            logsByLevel: { debug: 0, info: 0, warn: 0, error: 0 },
            logsByCategory: {},
            errorsByType: {},
            performanceMetrics: {
                averageLogTime: 0,
                totalLogTime: 0,
                operations: {}
            },
            loggerMetrics: {}
        };

        for (const [key, logger] of this.loggers) {
            const metrics = logger.getMetrics();
            
            // Aggregate totals
            aggregated.totalLogs += metrics.totalLogs;
            
            // Aggregate by level
            for (const [level, count] of Object.entries(metrics.logsByLevel)) {
                aggregated.logsByLevel[level] += count;
            }
            
            // Aggregate by category
            for (const [category, count] of Object.entries(metrics.logsByCategory)) {
                aggregated.logsByCategory[category] = (aggregated.logsByCategory[category] || 0) + count;
            }
            
            // Aggregate errors by type
            for (const [type, count] of Object.entries(metrics.errorsByType)) {
                aggregated.errorsByType[type] = (aggregated.errorsByType[type] || 0) + count;
            }
            
            // Aggregate performance metrics
            if (metrics.performanceMetrics.operations) {
                for (const [operation, opMetrics] of Object.entries(metrics.performanceMetrics.operations)) {
                    if (!aggregated.performanceMetrics.operations[operation]) {
                        aggregated.performanceMetrics.operations[operation] = {
                            count: 0,
                            totalTime: 0,
                            averageTime: 0
                        };
                    }
                    
                    const aggOp = aggregated.performanceMetrics.operations[operation];
                    aggOp.count += opMetrics.count;
                    aggOp.totalTime += opMetrics.totalTime;
                    aggOp.averageTime = aggOp.totalTime / aggOp.count;
                }
            }
            
            // Store individual logger metrics
            aggregated.loggerMetrics[key] = metrics;
        }

        // Calculate overall performance metrics
        if (aggregated.totalLogs > 0) {
            aggregated.performanceMetrics.totalLogTime = Object.values(aggregated.loggerMetrics)
                .reduce((sum, metrics) => sum + (metrics.performanceMetrics.totalLogTime || 0), 0);
            aggregated.performanceMetrics.averageLogTime = 
                aggregated.performanceMetrics.totalLogTime / aggregated.totalLogs;
        }

        return aggregated;
    }

    /**
     * Get recent logs from all loggers
     * @param {number} limit - Maximum number of logs per logger
     * @param {string} level - Filter by log level
     * @param {string} category - Filter by category
     * @returns {Array} Recent logs from all loggers
     */
    getRecentLogsFromAll(limit = 50, level = null, category = null) {
        const allLogs = [];

        for (const [key, logger] of this.loggers) {
            const logs = logger.getRecentLogs(limit, level, category);
            logs.forEach(log => {
                log.loggerName = key;
                allLogs.push(log);
            });
        }

        // Sort by timestamp
        allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return allLogs.slice(0, limit);
    }

    /**
     * Clear all loggers
     */
    clearAllLoggers() {
        for (const logger of this.loggers.values()) {
            logger.clear();
        }
    }

    /**
     * Flush all loggers
     */
    flushAllLoggers() {
        for (const logger of this.loggers.values()) {
            logger.flush();
        }
    }

    /**
     * Shutdown all loggers gracefully
     */
    shutdown() {
        this.flushAllLoggers();
        this.loggers.clear();
    }

    /**
     * Get default configuration
     * @private
     */
    _getDefaultConfig() {
        return {
            logLevel: process.env.LOG_LEVEL || 'info',
            enableConsoleOutput: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
            enableFileOutput: process.env.ENABLE_FILE_LOGGING === 'true',
            logDirectory: process.env.LOG_DIRECTORY || './logs',
            maxFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE) || 10 * 1024 * 1024,
            maxFiles: parseInt(process.env.MAX_LOG_FILES) || 5,
            enableMetrics: process.env.ENABLE_LOG_METRICS !== 'false',
            enableAggregation: process.env.ENABLE_LOG_AGGREGATION !== 'false',
            serviceName: 'send-time-optimization',
            environment: process.env.NODE_ENV || 'development',
            maxBufferSize: parseInt(process.env.LOG_BUFFER_SIZE) || 1000
        };
    }

    /**
     * Merge configuration with defaults
     * @private
     */
    _mergeConfig(config) {
        return {
            ...this.defaultConfig,
            ...config
        };
    }

    /**
     * Generate logger key for caching
     * @private
     */
    _getLoggerKey(name, config) {
        const configHash = JSON.stringify(config);
        return `${name}_${Buffer.from(configHash).toString('base64').slice(0, 8)}`;
    }
}

// Create singleton instance
const loggerFactory = new LoggerFactory();

module.exports = loggerFactory;