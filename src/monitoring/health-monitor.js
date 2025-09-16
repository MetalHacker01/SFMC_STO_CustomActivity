/**
 * Health Monitor
 * Implements comprehensive health checking for all system components
 * Provides detailed health status and performance metrics
 */

const { createApiLogger } = require('../logging');

/**
 * Health Status Levels
 */
const HealthStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    UNKNOWN: 'unknown'
};

/**
 * Health Monitor class that tracks system component health
 */
class HealthMonitor {
    constructor(config = {}) {
        this.config = {
            checkInterval: config.checkInterval || 30000, // 30 seconds
            healthTimeout: config.healthTimeout || 5000, // 5 seconds
            degradedThreshold: config.degradedThreshold || 0.8, // 80% success rate
            unhealthyThreshold: config.unhealthyThreshold || 0.5, // 50% success rate
            maxHistorySize: config.maxHistorySize || 100,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'info' });
        this.components = new Map();
        this.healthHistory = [];
        this.isMonitoring = false;
        this.monitoringInterval = null;
        
        // Overall system health
        this.systemHealth = {
            status: HealthStatus.UNKNOWN,
            lastCheck: null,
            uptime: process.uptime(),
            startTime: new Date()
        };

        // Performance metrics
        this.performanceMetrics = {
            responseTime: {
                current: 0,
                average: 0,
                min: Infinity,
                max: 0,
                samples: []
            },
            throughput: {
                requestsPerSecond: 0,
                totalRequests: 0,
                lastReset: Date.now()
            },
            errors: {
                total: 0,
                rate: 0,
                lastError: null,
                errorsByType: {}
            }
        };
    }

    /**
     * Register a component for health monitoring
     * @param {string} name - Component name
     * @param {Function} healthCheck - Health check function
     * @param {Object} config - Component-specific configuration
     */
    registerComponent(name, healthCheck, config = {}) {
        this.components.set(name, {
            name,
            healthCheck,
            config: {
                timeout: config.timeout || this.config.healthTimeout,
                critical: config.critical !== false, // Default to critical
                retryCount: config.retryCount || 1,
                ...config
            },
            status: HealthStatus.UNKNOWN,
            lastCheck: null,
            lastSuccess: null,
            lastFailure: null,
            consecutiveFailures: 0,
            totalChecks: 0,
            successfulChecks: 0,
            failedChecks: 0,
            averageResponseTime: 0,
            lastError: null
        });

        this.logger.info(`Registered health component`, {
            name,
            critical: this.components.get(name).config.critical,
            timeout: this.components.get(name).config.timeout
        }, 'health-monitor');
    }

    /**
     * Start health monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            this.logger.warn('Health monitoring is already running', {}, 'health-monitor');
            return;
        }

        this.isMonitoring = true;
        this.systemHealth.startTime = new Date();

        this.logger.info(`Starting health monitoring`, {
            interval: this.config.checkInterval,
            components: this.components.size
        }, 'health-monitor');

        // Perform initial health check
        this.performHealthCheck();

        // Schedule periodic health checks
        this.monitoringInterval = setInterval(() => {
            this.performHealthCheck();
        }, this.config.checkInterval);
    }

    /**
     * Stop health monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.logger.info('Stopped health monitoring', {}, 'health-monitor');
    }

    /**
     * Perform health check on all registered components
     * @returns {Promise<Object>} Overall health status
     */
    async performHealthCheck() {
        const checkStartTime = Date.now();
        const results = new Map();
        let overallStatus = HealthStatus.HEALTHY;
        let criticalFailures = 0;
        let totalFailures = 0;

        this.logger.debug(`Starting health check cycle`, {
            components: this.components.size,
            timestamp: new Date().toISOString()
        }, 'health-monitor');

        // Check each component
        for (const [name, component] of this.components) {
            try {
                const result = await this._checkComponent(component);
                results.set(name, result);

                // Update overall status based on component results
                if (result.status === HealthStatus.UNHEALTHY) {
                    totalFailures++;
                    if (component.config.critical) {
                        criticalFailures++;
                        overallStatus = HealthStatus.UNHEALTHY;
                    }
                } else if (result.status === HealthStatus.DEGRADED && overallStatus === HealthStatus.HEALTHY) {
                    if (component.config.critical) {
                        overallStatus = HealthStatus.DEGRADED;
                    }
                }

            } catch (error) {
                this.logger.error(`Health check failed for component`, {
                    component: name,
                    error: error.message
                }, 'health-monitor');

                results.set(name, {
                    status: HealthStatus.UNHEALTHY,
                    error: error.message,
                    timestamp: new Date().toISOString(),
                    responseTime: 0
                });

                totalFailures++;
                if (component.config.critical) {
                    criticalFailures++;
                    overallStatus = HealthStatus.UNHEALTHY;
                }
            }
        }

        const checkDuration = Date.now() - checkStartTime;

        // Update system health
        this.systemHealth = {
            status: overallStatus,
            lastCheck: new Date().toISOString(),
            uptime: process.uptime(),
            startTime: this.systemHealth.startTime,
            checkDuration,
            componentResults: Object.fromEntries(results),
            summary: {
                totalComponents: this.components.size,
                healthyComponents: this.components.size - totalFailures,
                failedComponents: totalFailures,
                criticalFailures
            }
        };

        // Add to history
        this._addToHistory(this.systemHealth);

        // Update performance metrics
        this._updatePerformanceMetrics(checkDuration);

        this.logger.info(`Health check completed`, {
            status: overallStatus,
            duration: `${checkDuration}ms`,
            totalComponents: this.components.size,
            failedComponents: totalFailures,
            criticalFailures
        }, 'health-monitor');

        return this.systemHealth;
    }

    /**
     * Get current system health status
     * @returns {Object} Current health status
     */
    getHealthStatus() {
        return {
            ...this.systemHealth,
            performanceMetrics: this.getPerformanceMetrics(),
            isMonitoring: this.isMonitoring
        };
    }

    /**
     * Get health status for specific component
     * @param {string} name - Component name
     * @returns {Object|null} Component health status
     */
    getComponentHealth(name) {
        const component = this.components.get(name);
        if (!component) {
            return null;
        }

        return {
            name: component.name,
            status: component.status,
            lastCheck: component.lastCheck,
            lastSuccess: component.lastSuccess,
            lastFailure: component.lastFailure,
            consecutiveFailures: component.consecutiveFailures,
            successfulChecks: component.successfulChecks,
            failedChecks: component.failedChecks,
            successRate: component.totalChecks > 0 
                ? (component.successfulChecks / component.totalChecks * 100).toFixed(2) + '%'
                : '0%',
            averageResponseTime: component.averageResponseTime,
            totalChecks: component.totalChecks,
            lastError: component.lastError,
            config: component.config
        };
    }

    /**
     * Get performance metrics
     * @returns {Object} Current performance metrics
     */
    getPerformanceMetrics() {
        const now = Date.now();
        const timeSinceReset = now - this.performanceMetrics.throughput.lastReset;
        const secondsSinceReset = timeSinceReset / 1000;

        return {
            responseTime: {
                ...this.performanceMetrics.responseTime,
                samples: this.performanceMetrics.responseTime.samples.length
            },
            throughput: {
                ...this.performanceMetrics.throughput,
                requestsPerSecond: secondsSinceReset > 0 
                    ? (this.performanceMetrics.throughput.totalRequests / secondsSinceReset).toFixed(2)
                    : 0
            },
            errors: {
                ...this.performanceMetrics.errors,
                rate: this.performanceMetrics.throughput.totalRequests > 0
                    ? (this.performanceMetrics.errors.total / this.performanceMetrics.throughput.totalRequests * 100).toFixed(2) + '%'
                    : '0%'
            },
            memory: process.memoryUsage(),
            uptime: process.uptime()
        };
    }

    /**
     * Record request metrics
     * @param {number} responseTime - Response time in milliseconds
     * @param {boolean} success - Whether request was successful
     * @param {string} errorType - Error type if request failed
     */
    recordRequest(responseTime, success = true, errorType = null) {
        // Update throughput
        this.performanceMetrics.throughput.totalRequests++;

        // Update response time metrics
        const rtMetrics = this.performanceMetrics.responseTime;
        rtMetrics.current = responseTime;
        rtMetrics.min = Math.min(rtMetrics.min, responseTime);
        rtMetrics.max = Math.max(rtMetrics.max, responseTime);
        
        rtMetrics.samples.push(responseTime);
        if (rtMetrics.samples.length > 100) {
            rtMetrics.samples = rtMetrics.samples.slice(-100);
        }
        
        rtMetrics.average = rtMetrics.samples.reduce((a, b) => a + b, 0) / rtMetrics.samples.length;

        // Update error metrics
        if (!success) {
            this.performanceMetrics.errors.total++;
            this.performanceMetrics.errors.lastError = {
                timestamp: new Date().toISOString(),
                type: errorType,
                responseTime
            };

            if (errorType) {
                if (!this.performanceMetrics.errors.errorsByType[errorType]) {
                    this.performanceMetrics.errors.errorsByType[errorType] = 0;
                }
                this.performanceMetrics.errors.errorsByType[errorType]++;
            }
        }
    }

    /**
     * Get health history
     * @param {number} limit - Maximum number of history entries
     * @returns {Array} Health history
     */
    getHealthHistory(limit = 50) {
        return this.healthHistory.slice(-limit);
    }

    /**
     * Reset performance metrics
     */
    resetMetrics() {
        this.performanceMetrics = {
            responseTime: {
                current: 0,
                average: 0,
                min: Infinity,
                max: 0,
                samples: []
            },
            throughput: {
                requestsPerSecond: 0,
                totalRequests: 0,
                lastReset: Date.now()
            },
            errors: {
                total: 0,
                rate: 0,
                lastError: null,
                errorsByType: {}
            }
        };

        this.logger.info('Performance metrics reset', {}, 'health-monitor');
    }

    /**
     * Check individual component health
     * @private
     */
    async _checkComponent(component) {
        const startTime = Date.now();
        component.totalChecks++;
        component.lastCheck = new Date().toISOString();

        try {
            // Execute health check with timeout
            const result = await Promise.race([
                component.healthCheck(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), component.config.timeout)
                )
            ]);

            const responseTime = Date.now() - startTime;
            
            // Update component metrics
            component.successfulChecks++;
            component.consecutiveFailures = 0;
            component.lastSuccess = new Date().toISOString();
            component.averageResponseTime = (component.averageResponseTime * (component.successfulChecks - 1) + responseTime) / component.successfulChecks;

            // Determine status based on result
            let status = HealthStatus.HEALTHY;
            if (result && typeof result === 'object') {
                status = result.status || HealthStatus.HEALTHY;
            }

            component.status = status;

            return {
                status,
                responseTime,
                timestamp: component.lastCheck,
                details: result
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            // Update failure metrics
            component.failedChecks++;
            component.consecutiveFailures++;
            component.lastFailure = new Date().toISOString();
            component.lastError = error.message;
            component.status = HealthStatus.UNHEALTHY;

            throw error;
        }
    }

    /**
     * Add health check result to history
     * @private
     */
    _addToHistory(healthStatus) {
        this.healthHistory.push({
            timestamp: healthStatus.lastCheck,
            status: healthStatus.status,
            checkDuration: healthStatus.checkDuration,
            summary: healthStatus.summary
        });

        // Limit history size
        if (this.healthHistory.length > this.config.maxHistorySize) {
            this.healthHistory = this.healthHistory.slice(-this.config.maxHistorySize);
        }
    }

    /**
     * Update performance metrics
     * @private
     */
    _updatePerformanceMetrics(duration) {
        this.recordRequest(duration, true);
    }
}

module.exports = {
    HealthMonitor,
    HealthStatus
};