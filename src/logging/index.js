/**
 * Logging Module Index
 * Provides centralized access to all logging functionality
 */

const StructuredLogger = require('./structured-logger');
const loggerFactory = require('./logger-factory');

// Export main components
module.exports = {
    StructuredLogger,
    loggerFactory,
    
    // Convenience methods for common logger types
    getLogger: (name, config) => loggerFactory.getLogger(name, config),
    createExecutionLogger: (config) => loggerFactory.createExecutionLogger(config),
    createDataExtensionLogger: (config) => loggerFactory.createDataExtensionLogger(config),
    createApiLogger: (config) => loggerFactory.createApiLogger(config),
    createHolidayLogger: (config) => loggerFactory.createHolidayLogger(config),
    createTimezoneLogger: (config) => loggerFactory.createTimezoneLogger(config),
    createTimeWindowLogger: (config) => loggerFactory.createTimeWindowLogger(config),
    createLifecycleLogger: (config) => loggerFactory.createLifecycleLogger(config),
    
    // Utility methods
    getAggregatedMetrics: () => loggerFactory.getAggregatedMetrics(),
    getRecentLogsFromAll: (limit, level, category) => loggerFactory.getRecentLogsFromAll(limit, level, category),
    clearAllLoggers: () => loggerFactory.clearAllLoggers(),
    flushAllLoggers: () => loggerFactory.flushAllLoggers(),
    shutdown: () => loggerFactory.shutdown()
};