/**
 * Circuit Breaker
 * Implements circuit breaker pattern for external service calls
 * Prevents cascading failures by temporarily blocking calls to failing services
 */

const { createApiLogger } = require('../logging');

/**
 * Circuit Breaker States
 */
const CircuitState = {
    CLOSED: 'CLOSED',       // Normal operation
    OPEN: 'OPEN',           // Circuit is open, calls are blocked
    HALF_OPEN: 'HALF_OPEN'  // Testing if service has recovered
};

/**
 * Circuit Breaker class that implements the circuit breaker pattern
 */
class CircuitBreaker {
    constructor(config = {}) {
        this.config = {
            failureThreshold: config.failureThreshold || 5,
            recoveryTimeout: config.recoveryTimeout || 60000, // 1 minute
            monitoringPeriod: config.monitoringPeriod || 10000, // 10 seconds
            halfOpenMaxCalls: config.halfOpenMaxCalls || 3,
            successThreshold: config.successThreshold || 2,
            name: config.name || 'circuit-breaker',
            ...config
        };

        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.halfOpenCalls = 0;
        
        this.logger = createApiLogger({ logLevel: 'debug' });
        
        // Statistics
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            rejectedCalls: 0,
            stateChanges: 0,
            lastStateChange: null,
            timeInStates: {
                [CircuitState.CLOSED]: 0,
                [CircuitState.OPEN]: 0,
                [CircuitState.HALF_OPEN]: 0
            },
            stateChangeHistory: []
        };

        this.stateStartTime = Date.now();
        
        // Start monitoring
        this._startMonitoring();
    }

    /**
     * Execute operation through circuit breaker
     * @param {Function} operation - Async operation to execute
     * @param {Object} context - Operation context
     * @returns {Promise} Operation result
     */
    async execute(operation, context = {}) {
        const callId = this._generateCallId();
        
        this.stats.totalCalls++;

        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            this.stats.rejectedCalls++;
            
            this.logger.warn(`Circuit breaker is OPEN, rejecting call`, {
                callId,
                circuitName: this.config.name,
                failureCount: this.failureCount,
                timeSinceLastFailure: Date.now() - this.lastFailureTime,
                context
            }, 'circuit-breaker');

            throw new CircuitBreakerOpenError(
                `Circuit breaker '${this.config.name}' is OPEN`,
                this.config.name
            );
        }

        // Check if we're in half-open state and have reached max calls
        if (this.state === CircuitState.HALF_OPEN && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
            this.stats.rejectedCalls++;
            
            this.logger.warn(`Circuit breaker is HALF_OPEN with max calls reached, rejecting call`, {
                callId,
                circuitName: this.config.name,
                halfOpenCalls: this.halfOpenCalls,
                maxCalls: this.config.halfOpenMaxCalls,
                context
            }, 'circuit-breaker');

            throw new CircuitBreakerOpenError(
                `Circuit breaker '${this.config.name}' is HALF_OPEN with max calls reached`,
                this.config.name
            );
        }

        // Increment half-open calls if in half-open state
        if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenCalls++;
        }

        const startTime = Date.now();

        try {
            const result = await operation();
            const duration = Date.now() - startTime;

            this._onSuccess(callId, duration, context);
            return result;

        } catch (error) {
            const duration = Date.now() - startTime;
            this._onFailure(callId, error, duration, context);
            throw error;
        }
    }

    /**
     * Create a wrapper function with circuit breaker
     * @param {Function} fn - Function to wrap
     * @param {Object} context - Default context
     * @returns {Function} Wrapped function
     */
    wrap(fn, context = {}) {
        return async (...args) => {
            return this.execute(() => fn(...args), context);
        };
    }

    /**
     * Get current circuit breaker state
     * @returns {string} Current state
     */
    getState() {
        return this.state;
    }

    /**
     * Get circuit breaker statistics
     * @returns {Object} Current statistics
     */
    getStats() {
        const now = Date.now();
        const currentStateDuration = now - this.stateStartTime;
        
        return {
            ...this.stats,
            currentState: this.state,
            currentStateDuration,
            failureCount: this.failureCount,
            successCount: this.successCount,
            halfOpenCalls: this.halfOpenCalls,
            lastFailureTime: this.lastFailureTime,
            config: this.config,
            healthStatus: this._getHealthStatus()
        };
    }

    /**
     * Force circuit breaker to specific state (for testing)
     * @param {string} state - Target state
     */
    forceState(state) {
        if (!Object.values(CircuitState).includes(state)) {
            throw new Error(`Invalid circuit breaker state: ${state}`);
        }

        this.logger.warn(`Forcing circuit breaker state change`, {
            circuitName: this.config.name,
            fromState: this.state,
            toState: state,
            forced: true
        }, 'circuit-breaker');

        this._changeState(state);
    }

    /**
     * Reset circuit breaker to initial state
     */
    reset() {
        this.logger.info(`Resetting circuit breaker`, {
            circuitName: this.config.name,
            previousState: this.state,
            failureCount: this.failureCount
        }, 'circuit-breaker');

        this._changeState(CircuitState.CLOSED);
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = null;
        this.halfOpenCalls = 0;
    }

    /**
     * Handle successful operation
     * @private
     */
    _onSuccess(callId, duration, context) {
        this.stats.successfulCalls++;
        this.successCount++;

        this.logger.debug(`Circuit breaker call succeeded`, {
            callId,
            circuitName: this.config.name,
            state: this.state,
            duration: `${duration}ms`,
            successCount: this.successCount,
            context
        }, 'circuit-breaker');

        if (this.state === CircuitState.HALF_OPEN) {
            if (this.successCount >= this.config.successThreshold) {
                this.logger.info(`Circuit breaker recovering: sufficient successes in HALF_OPEN`, {
                    circuitName: this.config.name,
                    successCount: this.successCount,
                    threshold: this.config.successThreshold
                }, 'circuit-breaker');

                this._changeState(CircuitState.CLOSED);
                this.failureCount = 0;
                this.successCount = 0;
                this.halfOpenCalls = 0;
            }
        } else if (this.state === CircuitState.CLOSED) {
            // Reset failure count on success in closed state
            if (this.failureCount > 0) {
                this.failureCount = 0;
            }
        }
    }

    /**
     * Handle failed operation
     * @private
     */
    _onFailure(callId, error, duration, context) {
        this.stats.failedCalls++;
        this.failureCount++;
        this.lastFailureTime = Date.now();

        this.logger.warn(`Circuit breaker call failed`, {
            callId,
            circuitName: this.config.name,
            state: this.state,
            duration: `${duration}ms`,
            failureCount: this.failureCount,
            error: error.message,
            context
        }, 'circuit-breaker');

        if (this.state === CircuitState.CLOSED) {
            if (this.failureCount >= this.config.failureThreshold) {
                this.logger.error(`Circuit breaker opening: failure threshold reached`, {
                    circuitName: this.config.name,
                    failureCount: this.failureCount,
                    threshold: this.config.failureThreshold
                }, 'circuit-breaker');

                this._changeState(CircuitState.OPEN);
            }
        } else if (this.state === CircuitState.HALF_OPEN) {
            this.logger.warn(`Circuit breaker reopening: failure in HALF_OPEN state`, {
                circuitName: this.config.name,
                halfOpenCalls: this.halfOpenCalls
            }, 'circuit-breaker');

            this._changeState(CircuitState.OPEN);
            this.halfOpenCalls = 0;
        }
    }

    /**
     * Change circuit breaker state
     * @private
     */
    _changeState(newState) {
        const oldState = this.state;
        const now = Date.now();
        
        // Update time in previous state
        this.stats.timeInStates[oldState] += now - this.stateStartTime;
        
        this.state = newState;
        this.stateStartTime = now;
        this.stats.stateChanges++;
        this.stats.lastStateChange = now;
        
        // Add to state change history
        this.stats.stateChangeHistory.push({
            timestamp: now,
            fromState: oldState,
            toState: newState,
            failureCount: this.failureCount,
            successCount: this.successCount
        });

        // Keep only last 10 state changes
        if (this.stats.stateChangeHistory.length > 10) {
            this.stats.stateChangeHistory = this.stats.stateChangeHistory.slice(-10);
        }

        this.logger.info(`Circuit breaker state changed`, {
            circuitName: this.config.name,
            fromState: oldState,
            toState: newState,
            failureCount: this.failureCount,
            successCount: this.successCount
        }, 'circuit-breaker');
    }

    /**
     * Start monitoring for state transitions
     * @private
     */
    _startMonitoring() {
        setInterval(() => {
            if (this.state === CircuitState.OPEN && this.lastFailureTime) {
                const timeSinceLastFailure = Date.now() - this.lastFailureTime;
                
                if (timeSinceLastFailure >= this.config.recoveryTimeout) {
                    this.logger.info(`Circuit breaker attempting recovery: timeout reached`, {
                        circuitName: this.config.name,
                        timeSinceLastFailure,
                        recoveryTimeout: this.config.recoveryTimeout
                    }, 'circuit-breaker');

                    this._changeState(CircuitState.HALF_OPEN);
                    this.successCount = 0;
                    this.halfOpenCalls = 0;
                }
            }
        }, this.config.monitoringPeriod);
    }

    /**
     * Get health status
     * @private
     */
    _getHealthStatus() {
        const totalCalls = this.stats.successfulCalls + this.stats.failedCalls;
        const successRate = totalCalls > 0 ? (this.stats.successfulCalls / totalCalls) * 100 : 100;
        
        let status = 'healthy';
        if (this.state === CircuitState.OPEN) {
            status = 'unhealthy';
        } else if (this.state === CircuitState.HALF_OPEN) {
            status = 'recovering';
        } else if (successRate < 90) {
            status = 'degraded';
        }

        return {
            status,
            successRate: `${successRate.toFixed(2)}%`,
            state: this.state,
            failureCount: this.failureCount
        };
    }

    /**
     * Generate unique call ID
     * @private
     */
    _generateCallId() {
        return `cb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
class CircuitBreakerManager {
    constructor() {
        this.circuitBreakers = new Map();
        this.logger = createApiLogger({ logLevel: 'info' });
    }

    /**
     * Get or create a circuit breaker
     * @param {string} name - Circuit breaker name
     * @param {Object} config - Circuit breaker configuration
     * @returns {CircuitBreaker} Circuit breaker instance
     */
    getCircuitBreaker(name, config = {}) {
        if (!this.circuitBreakers.has(name)) {
            const circuitBreaker = new CircuitBreaker({
                ...config,
                name
            });
            
            this.circuitBreakers.set(name, circuitBreaker);
            
            this.logger.info(`Created new circuit breaker`, {
                name,
                config
            }, 'circuit-breaker-manager');
        }

        return this.circuitBreakers.get(name);
    }

    /**
     * Get all circuit breakers
     * @returns {Map} All circuit breakers
     */
    getAllCircuitBreakers() {
        return new Map(this.circuitBreakers);
    }

    /**
     * Get aggregated statistics from all circuit breakers
     * @returns {Object} Aggregated statistics
     */
    getAggregatedStats() {
        const aggregated = {
            totalCircuitBreakers: this.circuitBreakers.size,
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            rejectedCalls: 0,
            circuitBreakerStats: {},
            healthSummary: {
                healthy: 0,
                degraded: 0,
                recovering: 0,
                unhealthy: 0
            }
        };

        for (const [name, circuitBreaker] of this.circuitBreakers) {
            const stats = circuitBreaker.getStats();
            
            aggregated.totalCalls += stats.totalCalls;
            aggregated.successfulCalls += stats.successfulCalls;
            aggregated.failedCalls += stats.failedCalls;
            aggregated.rejectedCalls += stats.rejectedCalls;
            
            aggregated.circuitBreakerStats[name] = stats;
            aggregated.healthSummary[stats.healthStatus.status]++;
        }

        return aggregated;
    }

    /**
     * Reset all circuit breakers
     */
    resetAll() {
        for (const circuitBreaker of this.circuitBreakers.values()) {
            circuitBreaker.reset();
        }
        
        this.logger.info(`Reset all circuit breakers`, {
            count: this.circuitBreakers.size
        }, 'circuit-breaker-manager');
    }

    /**
     * Remove a circuit breaker
     * @param {string} name - Circuit breaker name
     */
    remove(name) {
        if (this.circuitBreakers.delete(name)) {
            this.logger.info(`Removed circuit breaker`, { name }, 'circuit-breaker-manager');
        }
    }

    /**
     * Clear all circuit breakers
     */
    clear() {
        const count = this.circuitBreakers.size;
        this.circuitBreakers.clear();
        
        this.logger.info(`Cleared all circuit breakers`, { count }, 'circuit-breaker-manager');
    }
}

/**
 * Custom error class for circuit breaker open state
 */
class CircuitBreakerOpenError extends Error {
    constructor(message, circuitName) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
        this.circuitName = circuitName;
        this.code = 'CIRCUIT_BREAKER_OPEN';
    }
}

// Create singleton manager instance
const circuitBreakerManager = new CircuitBreakerManager();

module.exports = {
    CircuitBreaker,
    CircuitBreakerManager,
    CircuitBreakerOpenError,
    CircuitState,
    circuitBreakerManager
};