/**
 * Fallback Manager
 * Implements fallback behaviors for various failure scenarios
 * Provides graceful degradation when primary operations fail
 */

const { createApiLogger } = require('../logging');

/**
 * Fallback Strategy Types
 */
const FallbackType = {
    DEFAULT_VALUE: 'DEFAULT_VALUE',
    CACHED_VALUE: 'CACHED_VALUE',
    ALTERNATIVE_SERVICE: 'ALTERNATIVE_SERVICE',
    SIMPLIFIED_OPERATION: 'SIMPLIFIED_OPERATION',
    SKIP_OPERATION: 'SKIP_OPERATION',
    CUSTOM_FUNCTION: 'CUSTOM_FUNCTION'
};

/**
 * Fallback Manager class that handles various fallback strategies
 */
class FallbackManager {
    constructor(config = {}) {
        this.config = {
            enableFallbacks: config.enableFallbacks !== false,
            fallbackTimeout: config.fallbackTimeout || 5000,
            maxFallbackAttempts: config.maxFallbackAttempts || 2,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'debug' });
        this.fallbackStrategies = new Map();
        this.cache = new Map();
        
        // Statistics
        this.stats = {
            totalFallbacks: 0,
            fallbacksByType: {},
            fallbacksByOperation: {},
            successfulFallbacks: 0,
            failedFallbacks: 0
        };

        // Register default fallback strategies
        this._registerDefaultStrategies();
    }

    /**
     * Execute operation with fallback support
     * @param {string} operationName - Name of the operation
     * @param {Function} primaryOperation - Primary operation to execute
     * @param {Object} fallbackConfig - Fallback configuration
     * @returns {Promise} Operation result or fallback result
     */
    async executeWithFallback(operationName, primaryOperation, fallbackConfig = {}) {
        const executionId = this._generateExecutionId();
        
        if (!this.config.enableFallbacks) {
            return primaryOperation();
        }

        this.logger.debug(`Executing operation with fallback support`, {
            executionId,
            operationName,
            fallbackConfig
        }, 'fallback');

        try {
            // Try primary operation first
            const result = await primaryOperation();
            
            // Cache successful result if caching is enabled
            if (fallbackConfig.enableCaching) {
                this._cacheResult(operationName, result, fallbackConfig.cacheTtl);
            }
            
            return result;

        } catch (primaryError) {
            this.logger.warn(`Primary operation failed, attempting fallback`, {
                executionId,
                operationName,
                error: primaryError.message,
                fallbackConfig
            }, 'fallback');

            return this._executeFallback(
                executionId,
                operationName,
                primaryError,
                fallbackConfig
            );
        }
    }

    /**
     * Register a fallback strategy for an operation
     * @param {string} operationName - Operation name
     * @param {Object} strategy - Fallback strategy configuration
     */
    registerFallbackStrategy(operationName, strategy) {
        this.fallbackStrategies.set(operationName, {
            type: strategy.type || FallbackType.DEFAULT_VALUE,
            value: strategy.value,
            function: strategy.function,
            alternativeService: strategy.alternativeService,
            timeout: strategy.timeout || this.config.fallbackTimeout,
            maxAttempts: strategy.maxAttempts || this.config.maxFallbackAttempts,
            condition: strategy.condition,
            ...strategy
        });

        this.logger.info(`Registered fallback strategy`, {
            operationName,
            strategyType: strategy.type
        }, 'fallback');
    }

    /**
     * Create a fallback wrapper for a function
     * @param {string} operationName - Operation name
     * @param {Function} fn - Function to wrap
     * @param {Object} fallbackConfig - Fallback configuration
     * @returns {Function} Wrapped function with fallback support
     */
    wrapWithFallback(operationName, fn, fallbackConfig = {}) {
        return async (...args) => {
            return this.executeWithFallback(
                operationName,
                () => fn(...args),
                fallbackConfig
            );
        };
    }

    /**
     * Get cached value for operation
     * @param {string} operationName - Operation name
     * @returns {*} Cached value or null
     */
    getCachedValue(operationName) {
        const cacheEntry = this.cache.get(operationName);
        
        if (!cacheEntry) {
            return null;
        }

        // Check if cache entry has expired
        if (Date.now() > cacheEntry.expiresAt) {
            this.cache.delete(operationName);
            return null;
        }

        return cacheEntry.value;
    }

    /**
     * Clear cache for specific operation or all operations
     * @param {string} operationName - Operation name (optional)
     */
    clearCache(operationName = null) {
        if (operationName) {
            this.cache.delete(operationName);
            this.logger.debug(`Cleared cache for operation`, { operationName }, 'fallback');
        } else {
            this.cache.clear();
            this.logger.debug(`Cleared all cache entries`, {}, 'fallback');
        }
    }

    /**
     * Get fallback statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        return {
            ...this.stats,
            registeredStrategies: this.fallbackStrategies.size,
            cacheSize: this.cache.size,
            successRate: this.stats.totalFallbacks > 0
                ? ((this.stats.successfulFallbacks / this.stats.totalFallbacks) * 100).toFixed(2) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalFallbacks: 0,
            fallbacksByType: {},
            fallbacksByOperation: {},
            successfulFallbacks: 0,
            failedFallbacks: 0
        };
    }

    /**
     * Execute fallback strategy
     * @private
     */
    async _executeFallback(executionId, operationName, primaryError, fallbackConfig) {
        this.stats.totalFallbacks++;
        this._updateOperationStats(operationName);

        // Get registered strategy or use provided config
        const strategy = this.fallbackStrategies.get(operationName) || fallbackConfig;

        if (!strategy || !strategy.type) {
            this.logger.error(`No fallback strategy found for operation`, {
                executionId,
                operationName
            }, 'fallback');

            this.stats.failedFallbacks++;
            throw primaryError;
        }

        // Check if fallback condition is met
        if (strategy.condition && !strategy.condition(primaryError)) {
            this.logger.debug(`Fallback condition not met`, {
                executionId,
                operationName,
                error: primaryError.message
            }, 'fallback');

            this.stats.failedFallbacks++;
            throw primaryError;
        }

        this.logger.info(`Executing fallback strategy`, {
            executionId,
            operationName,
            strategyType: strategy.type
        }, 'fallback');

        try {
            const fallbackResult = await this._executeFallbackStrategy(
                executionId,
                operationName,
                strategy,
                primaryError
            );

            this.stats.successfulFallbacks++;
            this._updateTypeStats(strategy.type);

            this.logger.info(`Fallback strategy succeeded`, {
                executionId,
                operationName,
                strategyType: strategy.type
            }, 'fallback');

            return fallbackResult;

        } catch (fallbackError) {
            this.stats.failedFallbacks++;

            this.logger.error(`Fallback strategy failed`, {
                executionId,
                operationName,
                strategyType: strategy.type,
                fallbackError: fallbackError.message,
                primaryError: primaryError.message
            }, 'fallback');

            // Throw original error if fallback fails
            throw primaryError;
        }
    }

    /**
     * Execute specific fallback strategy
     * @private
     */
    async _executeFallbackStrategy(executionId, operationName, strategy, primaryError) {
        switch (strategy.type) {
            case FallbackType.DEFAULT_VALUE:
                return this._executeDefaultValue(strategy);

            case FallbackType.CACHED_VALUE:
                return this._executeCachedValue(operationName, strategy);

            case FallbackType.ALTERNATIVE_SERVICE:
                return this._executeAlternativeService(executionId, strategy, primaryError);

            case FallbackType.SIMPLIFIED_OPERATION:
                return this._executeSimplifiedOperation(executionId, strategy, primaryError);

            case FallbackType.SKIP_OPERATION:
                return this._executeSkipOperation(strategy);

            case FallbackType.CUSTOM_FUNCTION:
                return this._executeCustomFunction(executionId, strategy, primaryError);

            default:
                throw new Error(`Unknown fallback strategy type: ${strategy.type}`);
        }
    }

    /**
     * Execute default value fallback
     * @private
     */
    _executeDefaultValue(strategy) {
        return strategy.value;
    }

    /**
     * Execute cached value fallback
     * @private
     */
    _executeCachedValue(operationName, strategy) {
        const cachedValue = this.getCachedValue(operationName);
        
        if (cachedValue !== null) {
            return cachedValue;
        }

        // If no cached value and default is provided, use default
        if (strategy.defaultValue !== undefined) {
            return strategy.defaultValue;
        }

        throw new Error(`No cached value available for operation: ${operationName}`);
    }

    /**
     * Execute alternative service fallback
     * @private
     */
    async _executeAlternativeService(executionId, strategy, primaryError) {
        if (!strategy.alternativeService) {
            throw new Error('Alternative service not configured');
        }

        const timeout = strategy.timeout || this.config.fallbackTimeout;
        
        return Promise.race([
            strategy.alternativeService(primaryError),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Alternative service timeout')), timeout)
            )
        ]);
    }

    /**
     * Execute simplified operation fallback
     * @private
     */
    async _executeSimplifiedOperation(executionId, strategy, primaryError) {
        if (!strategy.simplifiedFunction) {
            throw new Error('Simplified function not configured');
        }

        const timeout = strategy.timeout || this.config.fallbackTimeout;
        
        return Promise.race([
            strategy.simplifiedFunction(primaryError),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Simplified operation timeout')), timeout)
            )
        ]);
    }

    /**
     * Execute skip operation fallback
     * @private
     */
    _executeSkipOperation(strategy) {
        return strategy.skipValue || null;
    }

    /**
     * Execute custom function fallback
     * @private
     */
    async _executeCustomFunction(executionId, strategy, primaryError) {
        if (!strategy.function) {
            throw new Error('Custom function not configured');
        }

        const timeout = strategy.timeout || this.config.fallbackTimeout;
        
        return Promise.race([
            strategy.function(primaryError),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Custom function timeout')), timeout)
            )
        ]);
    }

    /**
     * Cache operation result
     * @private
     */
    _cacheResult(operationName, result, ttl = 300000) { // Default 5 minutes
        this.cache.set(operationName, {
            value: result,
            cachedAt: Date.now(),
            expiresAt: Date.now() + ttl
        });

        this.logger.debug(`Cached result for operation`, {
            operationName,
            ttl: `${ttl}ms`
        }, 'fallback');
    }

    /**
     * Update operation statistics
     * @private
     */
    _updateOperationStats(operationName) {
        if (!this.stats.fallbacksByOperation[operationName]) {
            this.stats.fallbacksByOperation[operationName] = 0;
        }
        this.stats.fallbacksByOperation[operationName]++;
    }

    /**
     * Update type statistics
     * @private
     */
    _updateTypeStats(type) {
        if (!this.stats.fallbacksByType[type]) {
            this.stats.fallbacksByType[type] = 0;
        }
        this.stats.fallbacksByType[type]++;
    }

    /**
     * Generate unique execution ID
     * @private
     */
    _generateExecutionId() {
        return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Register default fallback strategies
     * @private
     */
    _registerDefaultStrategies() {
        // Timezone calculation fallback
        this.registerFallbackStrategy('timezone-calculation', {
            type: FallbackType.DEFAULT_VALUE,
            value: { offsetHours: 0, timezone: 'UTC', fallbackUsed: true },
            condition: (error) => error.message?.includes('timezone') || error.code === 'TIMEZONE_ERROR'
        });

        // Holiday check fallback
        this.registerFallbackStrategy('holiday-check', {
            type: FallbackType.CACHED_VALUE,
            defaultValue: { isHoliday: false, holidays: [], fallbackUsed: true },
            condition: (error) => error.message?.includes('holiday') || error.code === 'HOLIDAY_API_ERROR'
        });

        // Data extension update fallback
        this.registerFallbackStrategy('data-extension-update', {
            type: FallbackType.SKIP_OPERATION,
            skipValue: { success: false, skipped: true, reason: 'Fallback: Skip update due to API failure' },
            condition: (error) => error.response?.status >= 500 || error.code === 'ECONNREFUSED'
        });

        // SFMC authentication fallback
        this.registerFallbackStrategy('sfmc-auth', {
            type: FallbackType.CACHED_VALUE,
            condition: (error) => error.response?.status === 401 || error.message?.includes('authentication')
        });

        // Time window processing fallback
        this.registerFallbackStrategy('time-window-processing', {
            type: FallbackType.SIMPLIFIED_OPERATION,
            simplifiedFunction: (error) => {
                // Return a basic time window (9 AM - 5 PM)
                return {
                    selectedWindow: { startHour: 9, endHour: 17 },
                    fallbackUsed: true,
                    reason: 'Using default business hours due to processing error'
                };
            }
        });
    }
}

/**
 * Predefined fallback configurations
 */
const FallbackConfigurations = {
    /**
     * API call with cached fallback
     */
    apiWithCache: (cacheTtl = 300000) => ({
        type: FallbackType.CACHED_VALUE,
        enableCaching: true,
        cacheTtl,
        condition: (error) => error.response?.status >= 500 || error.code === 'ECONNREFUSED'
    }),

    /**
     * Service with alternative
     */
    serviceWithAlternative: (alternativeService) => ({
        type: FallbackType.ALTERNATIVE_SERVICE,
        alternativeService,
        timeout: 5000
    }),

    /**
     * Operation with default value
     */
    operationWithDefault: (defaultValue) => ({
        type: FallbackType.DEFAULT_VALUE,
        value: defaultValue
    }),

    /**
     * Optional operation that can be skipped
     */
    optionalOperation: (skipValue = null) => ({
        type: FallbackType.SKIP_OPERATION,
        skipValue,
        condition: (error) => error.response?.status >= 400
    }),

    /**
     * Critical operation with simplified version
     */
    criticalWithSimplified: (simplifiedFunction) => ({
        type: FallbackType.SIMPLIFIED_OPERATION,
        simplifiedFunction,
        timeout: 3000
    })
};

module.exports = {
    FallbackManager,
    FallbackType,
    FallbackConfigurations
};