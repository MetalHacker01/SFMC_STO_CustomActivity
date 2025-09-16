/**
 * Lifecycle Error Handler
 * 
 * Specialized error handling for Journey Builder lifecycle operations
 * with comprehensive logging and recovery mechanisms.
 * Requirements: 7.1, 7.4 - Error handling and logging
 */

class LifecycleErrorHandler {
    constructor(logger) {
        this.logger = logger;
        this.errorStats = {
            save: { total: 0, byType: {} },
            validate: { total: 0, byType: {} },
            publish: { total: 0, byType: {} }
        };
    }

    /**
     * Handles errors during save operations
     * Requirement 7.1: Log detailed error information including contact ID, timestamp, and error details
     */
    handleSaveError(error, context) {
        const errorInfo = this.extractErrorInfo(error);
        const errorContext = {
            operation: 'save',
            activityObjectID: context.activityObjectID,
            journeyId: context.journeyId,
            timestamp: new Date().toISOString(),
            ...errorInfo
        };

        // Update error statistics
        this.errorStats.save.total++;
        this.errorStats.save.byType[errorInfo.type] = (this.errorStats.save.byType[errorInfo.type] || 0) + 1;

        // Log detailed error information
        this.logger.error('Save operation error', errorContext);

        // Determine appropriate response based on error type
        return this.createErrorResponse(errorInfo, context, 'save');
    }

    /**
     * Handles errors during validate operations
     * Requirement 7.1: Log detailed error information
     */
    handleValidateError(error, context) {
        const errorInfo = this.extractErrorInfo(error);
        const errorContext = {
            operation: 'validate',
            activityObjectID: context.activityObjectID,
            journeyId: context.journeyId,
            timestamp: new Date().toISOString(),
            ...errorInfo
        };

        // Update error statistics
        this.errorStats.validate.total++;
        this.errorStats.validate.byType[errorInfo.type] = (this.errorStats.validate.byType[errorInfo.type] || 0) + 1;

        // Log detailed error information
        this.logger.error('Validate operation error', errorContext);

        // Return validation-specific error response
        return {
            valid: false,
            error: this.getSafeErrorMessage(errorInfo, 'validate'),
            details: this.getErrorDetails(errorInfo),
            timestamp: new Date().toISOString(),
            errorType: errorInfo.type,
            recoverable: this.isRecoverable(errorInfo)
        };
    }

    /**
     * Handles errors during publish operations
     * Requirement 7.1: Log detailed error information
     */
    handlePublishError(error, context) {
        const errorInfo = this.extractErrorInfo(error);
        const errorContext = {
            operation: 'publish',
            activityObjectID: context.activityObjectID,
            journeyId: context.journeyId,
            timestamp: new Date().toISOString(),
            ...errorInfo
        };

        // Update error statistics
        this.errorStats.publish.total++;
        this.errorStats.publish.byType[errorInfo.type] = (this.errorStats.publish.byType[errorInfo.type] || 0) + 1;

        // Log detailed error information
        this.logger.error('Publish operation error', errorContext);

        // Determine if this is a critical error that should block publishing
        const isCritical = this.isCriticalPublishError(errorInfo);
        
        if (isCritical) {
            this.logger.error('Critical publish error detected', {
                ...errorContext,
                critical: true,
                blockingPublish: true
            });
        }

        return this.createErrorResponse(errorInfo, context, 'publish');
    }

    /**
     * Handles configuration validation errors
     * Requirement 7.4: Retry operation according to configured retry policies
     */
    handleConfigurationError(error, config, context) {
        const errorInfo = this.extractErrorInfo(error);
        
        // Log configuration-specific error details
        this.logger.error('Configuration validation error', {
            operation: 'configuration_validation',
            activityObjectID: context.activityObjectID,
            configSummary: this.getConfigSummary(config),
            timestamp: new Date().toISOString(),
            ...errorInfo
        });

        // Provide specific guidance for configuration errors
        const guidance = this.getConfigurationGuidance(errorInfo, config);

        return {
            valid: false,
            error: 'Configuration validation failed',
            details: this.getErrorDetails(errorInfo),
            guidance,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Handles dependency validation errors (SFMC API, Holiday API, etc.)
     */
    handleDependencyError(error, dependency, context) {
        const errorInfo = this.extractErrorInfo(error);
        
        this.logger.error('Dependency validation error', {
            operation: 'dependency_validation',
            dependency,
            activityObjectID: context.activityObjectID,
            timestamp: new Date().toISOString(),
            ...errorInfo
        });

        // Determine if this is a temporary or permanent failure
        const isTemporary = this.isTemporaryError(errorInfo);
        
        return {
            dependency,
            available: false,
            error: this.getSafeErrorMessage(errorInfo, 'dependency'),
            temporary: isTemporary,
            retryAfter: isTemporary ? this.getRetryDelay(errorInfo) : null,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Extracts structured error information from various error types
     */
    extractErrorInfo(error) {
        const errorInfo = {
            message: error.message || 'Unknown error',
            type: this.classifyError(error),
            code: error.code || error.status || 'UNKNOWN',
            stack: error.stack,
            timestamp: new Date().toISOString()
        };

        // Add specific information based on error type
        if (error.response) {
            // HTTP/API errors
            errorInfo.httpStatus = error.response.status;
            errorInfo.httpStatusText = error.response.statusText;
            errorInfo.responseData = error.response.data;
        }

        if (error.config) {
            // Axios request errors
            errorInfo.requestUrl = error.config.url;
            errorInfo.requestMethod = error.config.method;
            errorInfo.requestTimeout = error.config.timeout;
        }

        if (error.name) {
            errorInfo.errorName = error.name;
        }

        return errorInfo;
    }

    /**
     * Classifies errors into categories for better handling
     */
    classifyError(error) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return 'NETWORK_ERROR';
        }
        
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
            return 'TIMEOUT_ERROR';
        }
        
        if (error.response?.status >= 400 && error.response?.status < 500) {
            return 'CLIENT_ERROR';
        }
        
        if (error.response?.status >= 500) {
            return 'SERVER_ERROR';
        }
        
        if (error.name === 'ValidationError' || error.message?.includes('validation')) {
            return 'VALIDATION_ERROR';
        }
        
        if (error.name === 'TypeError' || error.name === 'ReferenceError') {
            return 'PROGRAMMING_ERROR';
        }
        
        if (error.message?.includes('JWT') || error.message?.includes('token')) {
            return 'AUTHENTICATION_ERROR';
        }
        
        return 'UNKNOWN_ERROR';
    }

    /**
     * Creates appropriate error response based on error type and operation
     */
    createErrorResponse(errorInfo, context, operation) {
        const baseResponse = {
            success: false,
            error: this.getSafeErrorMessage(errorInfo, operation),
            timestamp: new Date().toISOString(),
            errorType: errorInfo.type,
            recoverable: this.isRecoverable(errorInfo)
        };

        // Add operation-specific fields
        if (operation === 'validate') {
            baseResponse.valid = false;
        }

        // Add details in development mode
        if (process.env.NODE_ENV === 'development') {
            baseResponse.details = this.getErrorDetails(errorInfo);
            baseResponse.context = context;
        }

        // Add retry information for recoverable errors
        if (baseResponse.recoverable) {
            baseResponse.retryAfter = this.getRetryDelay(errorInfo);
            baseResponse.maxRetries = this.getMaxRetries(errorInfo);
        }

        return baseResponse;
    }

    /**
     * Gets user-safe error message (hides sensitive information)
     */
    getSafeErrorMessage(errorInfo, operation) {
        const operationMessages = {
            save: 'Failed to save activity configuration',
            validate: 'Configuration validation failed',
            publish: 'Failed to publish activity',
            dependency: 'External service unavailable'
        };

        const baseMessage = operationMessages[operation] || 'Operation failed';

        // Provide more specific messages for common error types
        switch (errorInfo.type) {
            case 'NETWORK_ERROR':
                return `${baseMessage} - Network connectivity issue`;
            case 'TIMEOUT_ERROR':
                return `${baseMessage} - Request timed out`;
            case 'AUTHENTICATION_ERROR':
                return `${baseMessage} - Authentication failed`;
            case 'VALIDATION_ERROR':
                return `${baseMessage} - Invalid configuration`;
            case 'CLIENT_ERROR':
                return `${baseMessage} - Invalid request`;
            case 'SERVER_ERROR':
                return `${baseMessage} - Server error`;
            default:
                return baseMessage;
        }
    }

    /**
     * Gets detailed error information for debugging
     */
    getErrorDetails(errorInfo) {
        const details = {
            type: errorInfo.type,
            code: errorInfo.code,
            message: errorInfo.message
        };

        if (errorInfo.httpStatus) {
            details.httpStatus = errorInfo.httpStatus;
            details.httpStatusText = errorInfo.httpStatusText;
        }

        if (errorInfo.requestUrl) {
            details.requestUrl = errorInfo.requestUrl;
            details.requestMethod = errorInfo.requestMethod;
        }

        return details;
    }

    /**
     * Determines if an error is recoverable through retry
     */
    isRecoverable(errorInfo) {
        const recoverableTypes = [
            'NETWORK_ERROR',
            'TIMEOUT_ERROR',
            'SERVER_ERROR'
        ];

        return recoverableTypes.includes(errorInfo.type);
    }

    /**
     * Determines if an error is critical for publish operations
     */
    isCriticalPublishError(errorInfo) {
        const criticalTypes = [
            'AUTHENTICATION_ERROR',
            'VALIDATION_ERROR',
            'PROGRAMMING_ERROR'
        ];

        return criticalTypes.includes(errorInfo.type);
    }

    /**
     * Determines if an error is temporary
     */
    isTemporaryError(errorInfo) {
        const temporaryTypes = [
            'NETWORK_ERROR',
            'TIMEOUT_ERROR',
            'SERVER_ERROR'
        ];

        return temporaryTypes.includes(errorInfo.type);
    }

    /**
     * Gets appropriate retry delay based on error type
     */
    getRetryDelay(errorInfo) {
        const delays = {
            'NETWORK_ERROR': 5000,    // 5 seconds
            'TIMEOUT_ERROR': 10000,   // 10 seconds
            'SERVER_ERROR': 15000,    // 15 seconds
            'CLIENT_ERROR': 30000     // 30 seconds
        };

        return delays[errorInfo.type] || 5000;
    }

    /**
     * Gets maximum retry attempts based on error type
     */
    getMaxRetries(errorInfo) {
        const maxRetries = {
            'NETWORK_ERROR': 3,
            'TIMEOUT_ERROR': 2,
            'SERVER_ERROR': 2,
            'CLIENT_ERROR': 1
        };

        return maxRetries[errorInfo.type] || 1;
    }

    /**
     * Provides configuration-specific guidance for errors
     */
    getConfigurationGuidance(errorInfo, config) {
        const guidance = [];

        if (errorInfo.message?.includes('time window')) {
            guidance.push('Ensure at least one time window is selected and properly configured');
            guidance.push('Time windows must have valid start and end hours (0-23)');
        }

        if (errorInfo.message?.includes('timezone')) {
            guidance.push('Check that the default timezone is properly configured');
            guidance.push('Verify timezone format matches expected standards');
        }

        if (errorInfo.message?.includes('holiday')) {
            guidance.push('Verify holiday API configuration if holiday exclusion is enabled');
            guidance.push('Check network connectivity to holiday service');
        }

        if (config && !config.timeWindows?.length) {
            guidance.push('At least one time window must be configured');
        }

        return guidance;
    }

    /**
     * Gets a summary of configuration for logging
     */
    getConfigSummary(config) {
        if (!config) return 'No configuration provided';

        return {
            hasTimeWindows: !!config.timeWindows?.length,
            timeWindowsCount: config.timeWindows?.length || 0,
            skipWeekends: config.skipWeekends,
            skipHolidays: config.skipHolidays,
            hasDefaultTimezone: !!config.defaultTimezone
        };
    }

    /**
     * Gets error statistics for monitoring
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Resets error statistics
     */
    resetErrorStats() {
        this.errorStats = {
            save: { total: 0, byType: {} },
            validate: { total: 0, byType: {} },
            publish: { total: 0, byType: {} }
        };
    }

    /**
     * Checks if error rate is too high (for circuit breaker pattern)
     */
    isErrorRateHigh(operation, timeWindow = 300000) { // 5 minutes
        const stats = this.errorStats[operation];
        if (!stats) return false;

        // Simple implementation - in production, you'd want more sophisticated rate tracking
        return stats.total > 10; // More than 10 errors
    }
}

module.exports = LifecycleErrorHandler;