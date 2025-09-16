/**
 * Error Recovery Module Index
 * Provides centralized access to all error recovery functionality
 */

const { RetryManager, RetryExhaustedError, RetryStrategies } = require('./retry-manager');
const { CircuitBreaker, CircuitBreakerManager, CircuitBreakerOpenError, CircuitState, circuitBreakerManager } = require('./circuit-breaker');
const { FallbackManager, FallbackType, FallbackConfigurations } = require('./fallback-manager');

/**
 * Integrated Error Recovery System
 * Combines retry, circuit breaker, and fallback mechanisms
 */
class ErrorRecoverySystem {
    constructor(config = {}) {
        this.retryManager = new RetryManager(config.retry || {});
        this.fallbackManager = new FallbackManager(config.fallback || {});
        this.circuitBreakerManager = circuitBreakerManager;
        
        this.config = {
            enableRetry: config.enableRetry !== false,
            enableCircuitBreaker: config.enableCircuitBreaker !== false,
            enableFallback: config.enableFallback !== false,
            ...config
        };
    }

    /**
     * Execute operation with full error recovery support
     * @param {string} operationName - Operation name
     * @param {Function} operation - Operation to execute
     * @param {Object} options - Recovery options
     * @returns {Promise} Operation result
     */
    async executeWithRecovery(operationName, operation, options = {}) {
        const {
            retry = {},
            circuitBreaker = {},
            fallback = {},
            enableRetry = this.config.enableRetry,
            enableCircuitBreaker = this.config.enableCircuitBreaker,
            enableFallback = this.config.enableFallback
        } = options;

        let wrappedOperation = operation;

        // Wrap with circuit breaker if enabled
        if (enableCircuitBreaker) {
            const cb = this.circuitBreakerManager.getCircuitBreaker(
                operationName,
                circuitBreaker
            );
            wrappedOperation = () => cb.execute(wrappedOperation);
        }

        // Wrap with retry if enabled
        if (enableRetry) {
            const retryOptions = {
                operationName,
                ...retry
            };
            wrappedOperation = () => this.retryManager.executeWithRetry(wrappedOperation, retryOptions);
        }

        // Wrap with fallback if enabled
        if (enableFallback) {
            return this.fallbackManager.executeWithFallback(
                operationName,
                wrappedOperation,
                fallback
            );
        }

        return wrappedOperation();
    }

    /**
     * Create a wrapper function with full error recovery
     * @param {string} operationName - Operation name
     * @param {Function} fn - Function to wrap
     * @param {Object} options - Recovery options
     * @returns {Function} Wrapped function
     */
    wrapWithRecovery(operationName, fn, options = {}) {
        return async (...args) => {
            return this.executeWithRecovery(
                operationName,
                () => fn(...args),
                options
            );
        };
    }

    /**
     * Get comprehensive statistics from all recovery mechanisms
     * @returns {Object} Aggregated statistics
     */
    getStats() {
        return {
            retry: this.retryManager.getStats(),
            circuitBreaker: this.circuitBreakerManager.getAggregatedStats(),
            fallback: this.fallbackManager.getStats(),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Reset all statistics
     */
    resetStats() {
        this.retryManager.resetStats();
        this.circuitBreakerManager.resetAll();
        this.fallbackManager.resetStats();
    }
}

/**
 * Create preconfigured error recovery systems for common scenarios
 */
const ErrorRecoveryPresets = {
    /**
     * API call recovery configuration
     */
    apiCall: (operationName) => ({
        retry: RetryStrategies.apiCall(3),
        circuitBreaker: {
            failureThreshold: 5,
            recoveryTimeout: 30000,
            name: `${operationName}-api`
        },
        fallback: FallbackConfigurations.apiWithCache(300000)
    }),

    /**
     * Database operation recovery configuration
     */
    database: (operationName) => ({
        retry: RetryStrategies.database(2),
        circuitBreaker: {
            failureThreshold: 3,
            recoveryTimeout: 15000,
            name: `${operationName}-db`
        },
        fallback: FallbackConfigurations.optionalOperation()
    }),

    /**
     * External service recovery configuration
     */
    externalService: (operationName, alternativeService = null) => ({
        retry: RetryStrategies.exponentialBackoff(3, 2000, 30000),
        circuitBreaker: {
            failureThreshold: 5,
            recoveryTimeout: 60000,
            name: `${operationName}-external`
        },
        fallback: alternativeService 
            ? FallbackConfigurations.serviceWithAlternative(alternativeService)
            : FallbackConfigurations.optionalOperation()
    }),

    /**
     * Critical operation recovery configuration
     */
    critical: (operationName, simplifiedFunction) => ({
        retry: RetryStrategies.exponentialBackoff(5, 1000, 60000),
        circuitBreaker: {
            failureThreshold: 10,
            recoveryTimeout: 120000,
            name: `${operationName}-critical`
        },
        fallback: FallbackConfigurations.criticalWithSimplified(simplifiedFunction)
    }),

    /**
     * Optional operation recovery configuration
     */
    optional: (operationName) => ({
        retry: RetryStrategies.immediate(1),
        circuitBreaker: {
            failureThreshold: 2,
            recoveryTimeout: 10000,
            name: `${operationName}-optional`
        },
        fallback: FallbackConfigurations.optionalOperation()
    })
};

// Create default error recovery system instance
const defaultErrorRecovery = new ErrorRecoverySystem();

module.exports = {
    // Core classes
    RetryManager,
    CircuitBreaker,
    CircuitBreakerManager,
    FallbackManager,
    ErrorRecoverySystem,
    
    // Error classes
    RetryExhaustedError,
    CircuitBreakerOpenError,
    
    // Enums and constants
    CircuitState,
    FallbackType,
    
    // Configurations and presets
    RetryStrategies,
    FallbackConfigurations,
    ErrorRecoveryPresets,
    
    // Singleton instances
    circuitBreakerManager,
    defaultErrorRecovery,
    
    // Convenience methods
    executeWithRecovery: (operationName, operation, options) => 
        defaultErrorRecovery.executeWithRecovery(operationName, operation, options),
    wrapWithRecovery: (operationName, fn, options) => 
        defaultErrorRecovery.wrapWithRecovery(operationName, fn, options),
    getRecoveryStats: () => defaultErrorRecovery.getStats(),
    resetRecoveryStats: () => defaultErrorRecovery.resetStats()
};