/**
 * Data Extension Integration Module
 * Handles SFMC API interactions for data extension updates with comprehensive error handling
 */

const SFMCAuthService = require('./sfmc-auth');
const DataExtensionAPI = require('./data-extension-api');
const ConvertedTimeUpdater = require('./converted-time-updater');
const DataExtensionErrorHandler = require('./error-handler');
const DataExtensionOperationLogger = require('./operation-logger');

/**
 * Creates a configured Data Extension API instance
 * @param {Object} config - SFMC configuration
 * @param {Object} logger - Logger instance
 * @returns {DataExtensionAPI} Configured API instance
 */
function createDataExtensionAPI(config, logger = console) {
    return new DataExtensionAPI(config, logger);
}

/**
 * Creates a configured SFMC Auth Service instance
 * @param {Object} config - SFMC configuration
 * @param {Object} logger - Logger instance
 * @returns {SFMCAuthService} Configured auth service instance
 */
function createAuthService(config, logger = console) {
    return new SFMCAuthService(config, logger);
}

/**
 * Creates a configured ConvertedTime Updater instance
 * @param {Object} config - SFMC configuration with batch settings
 * @param {Object} logger - Logger instance
 * @returns {ConvertedTimeUpdater} Configured updater instance
 */
function createConvertedTimeUpdater(config, logger = console) {
    return new ConvertedTimeUpdater(config, logger);
}

/**
 * Creates a configured Error Handler instance
 * @param {Object} config - Error handling configuration
 * @param {Object} logger - Logger instance
 * @returns {DataExtensionErrorHandler} Configured error handler instance
 */
function createErrorHandler(config, logger = console) {
    return new DataExtensionErrorHandler(config, logger);
}

/**
 * Creates a configured Operation Logger instance
 * @param {Object} config - Logging configuration
 * @param {Object} baseLogger - Base logger instance
 * @returns {DataExtensionOperationLogger} Configured operation logger instance
 */
function createOperationLogger(config, baseLogger = console) {
    return new DataExtensionOperationLogger(config, baseLogger);
}

/**
 * Creates a complete data extension integration suite with error handling
 * @param {Object} config - Complete configuration object
 * @param {Object} baseLogger - Base logger instance
 * @returns {Object} Complete integration suite
 */
function createDataExtensionSuite(config, baseLogger = console) {
    const operationLogger = createOperationLogger(config.logging || {}, baseLogger);
    const errorHandler = createErrorHandler(config.errorHandling || {}, operationLogger);
    const authService = createAuthService(config.sfmc || {}, operationLogger);
    const dataExtensionAPI = createDataExtensionAPI(config.sfmc || {}, operationLogger);
    const convertedTimeUpdater = createConvertedTimeUpdater(config.sfmc || {}, operationLogger);

    return {
        operationLogger,
        errorHandler,
        authService,
        dataExtensionAPI,
        convertedTimeUpdater,
        
        // Convenience methods with error handling
        updateConvertedTimeWithErrorHandling: errorHandler.wrapWithErrorHandling(
            (subscriberKey, convertedTime, dataExtensionKey) => 
                convertedTimeUpdater.updateConvertedTime(subscriberKey, convertedTime, dataExtensionKey),
            'updateConvertedTime'
        ),
        
        batchUpdateWithErrorHandling: errorHandler.wrapWithErrorHandling(
            (updates, dataExtensionKey) => 
                convertedTimeUpdater.batchUpdateConvertedTime(updates, dataExtensionKey),
            'batchUpdateConvertedTime'
        ),
        
        validateDataExtensionWithErrorHandling: errorHandler.wrapWithErrorHandling(
            (dataExtensionKey) => 
                convertedTimeUpdater.validateDataExtension(dataExtensionKey),
            'validateDataExtension'
        )
    };
}

module.exports = {
    // Core classes
    SFMCAuthService,
    DataExtensionAPI,
    ConvertedTimeUpdater,
    DataExtensionErrorHandler,
    DataExtensionOperationLogger,
    
    // Factory functions
    createDataExtensionAPI,
    createAuthService,
    createConvertedTimeUpdater,
    createErrorHandler,
    createOperationLogger,
    createDataExtensionSuite
};