/**
 * Monitoring Module Index
 * Provides centralized access to all monitoring functionality
 */

const { HealthMonitor, HealthStatus } = require('./health-monitor');
const { PerformanceCollector, MetricType } = require('./performance-collector');
const { AlertingSystem, AlertSeverity, AlertStatus, AlertChannel, CommonAlertRules } = require('./alerting-system');

/**
 * Integrated Monitoring System
 * Combines health monitoring, performance collection, and alerting
 */
class MonitoringSystem {
    constructor(config = {}) {
        this.config = {
            enableHealthMonitoring: config.enableHealthMonitoring !== false,
            enablePerformanceCollection: config.enablePerformanceCollection !== false,
            enableAlerting: config.enableAlerting !== false,
            healthCheckInterval: config.healthCheckInterval || 30000,
            metricsCollectionInterval: config.metricsCollectionInterval || 60000,
            alertEvaluationInterval: config.alertEvaluationInterval || 30000,
            ...config
        };

        // Initialize components
        this.healthMonitor = new HealthMonitor({
            checkInterval: this.config.healthCheckInterval,
            ...config.health
        });

        this.performanceCollector = new PerformanceCollector({
            collectionInterval: this.config.metricsCollectionInterval,
            ...config.performance
        });

        this.alertingSystem = new AlertingSystem({
            enableAlerting: this.config.enableAlerting,
            ...config.alerting
        });

        this.isRunning = false;
        this.alertEvaluationInterval = null;

        // Register default alert rules
        this._registerDefaultAlertRules();
    }

    /**
     * Start the monitoring system
     */
    start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;

        // Start health monitoring
        if (this.config.enableHealthMonitoring) {
            this.healthMonitor.startMonitoring();
        }

        // Start performance collection
        if (this.config.enablePerformanceCollection) {
            this.performanceCollector.startCollection();
        }

        // Start alert evaluation
        if (this.config.enableAlerting) {
            this._startAlertEvaluation();
        }

        console.log('Monitoring system started');
    }

    /**
     * Stop the monitoring system
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        // Stop components
        this.healthMonitor.stopMonitoring();
        this.performanceCollector.stopCollection();
        
        if (this.alertEvaluationInterval) {
            clearInterval(this.alertEvaluationInterval);
            this.alertEvaluationInterval = null;
        }

        console.log('Monitoring system stopped');
    }

    /**
     * Register a health check component
     * @param {string} name - Component name
     * @param {Function} healthCheck - Health check function
     * @param {Object} config - Component configuration
     */
    registerHealthCheck(name, healthCheck, config = {}) {
        this.healthMonitor.registerComponent(name, healthCheck, config);
    }

    /**
     * Register a custom metric
     * @param {string} name - Metric name
     * @param {string} type - Metric type
     * @param {Object} config - Metric configuration
     */
    registerMetric(name, type, config = {}) {
        this.performanceCollector.registerMetric(name, type, config);
    }

    /**
     * Register an alert rule
     * @param {string} name - Rule name
     * @param {Object} rule - Alert rule configuration
     */
    registerAlertRule(name, rule) {
        this.alertingSystem.registerAlertRule(name, rule);
    }

    /**
     * Register an alert channel
     * @param {string} name - Channel name
     * @param {string} type - Channel type
     * @param {Object} config - Channel configuration
     */
    registerAlertChannel(name, type, config = {}) {
        this.alertingSystem.registerAlertChannel(name, type, config);
    }

    /**
     * Record a request for monitoring
     * @param {string} method - HTTP method
     * @param {string} route - Route path
     * @param {number} statusCode - Response status code
     * @param {number} duration - Request duration
     */
    recordRequest(method, route, statusCode, duration) {
        this.performanceCollector.recordRequest(method, route, statusCode, duration);
        this.healthMonitor.recordRequest(duration, statusCode < 400);
    }

    /**
     * Record an operation for monitoring
     * @param {string} operation - Operation name
     * @param {number} duration - Operation duration
     * @param {boolean} success - Whether operation succeeded
     * @param {string} errorType - Error type if failed
     */
    recordOperation(operation, duration, success = true, errorType = null) {
        this.performanceCollector.recordOperation(operation, duration, success, errorType);
    }

    /**
     * Get comprehensive monitoring status
     * @returns {Object} Complete monitoring status
     */
    async getStatus() {
        const healthStatus = this.healthMonitor.getHealthStatus();
        const performanceMetrics = this.performanceCollector.getPerformanceSummary();
        const alertingStats = this.alertingSystem.getStats();

        return {
            timestamp: new Date().toISOString(),
            isRunning: this.isRunning,
            health: healthStatus,
            performance: performanceMetrics,
            alerting: {
                ...alertingStats,
                activeAlerts: this.alertingSystem.getActiveAlerts()
            },
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        };
    }

    /**
     * Get health status only
     * @returns {Object} Health status
     */
    getHealthStatus() {
        return this.healthMonitor.getHealthStatus();
    }

    /**
     * Get performance metrics only
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        return this.performanceCollector.getAllMetrics();
    }

    /**
     * Get active alerts only
     * @returns {Array} Active alerts
     */
    getActiveAlerts() {
        return this.alertingSystem.getActiveAlerts();
    }

    /**
     * Trigger a manual alert
     * @param {string} ruleName - Rule name
     * @param {Object} context - Alert context
     */
    triggerAlert(ruleName, context = {}) {
        this.alertingSystem.triggerAlert(ruleName, context);
    }

    /**
     * Create an Express middleware for request monitoring
     * @returns {Function} Express middleware
     */
    createExpressMiddleware() {
        return (req, res, next) => {
            const startTime = Date.now();
            
            // Override res.end to capture response
            const originalEnd = res.end;
            res.end = (...args) => {
                const duration = Date.now() - startTime;
                this.recordRequest(req.method, req.route?.path || req.path, res.statusCode, duration);
                originalEnd.apply(res, args);
            };
            
            next();
        };
    }

    /**
     * Create a function wrapper for operation monitoring
     * @param {string} operationName - Operation name
     * @param {Function} fn - Function to wrap
     * @returns {Function} Wrapped function
     */
    wrapOperation(operationName, fn) {
        return async (...args) => {
            const startTime = Date.now();
            
            try {
                const result = await fn(...args);
                const duration = Date.now() - startTime;
                this.recordOperation(operationName, duration, true);
                return result;
            } catch (error) {
                const duration = Date.now() - startTime;
                this.recordOperation(operationName, duration, false, error.constructor.name);
                throw error;
            }
        };
    }

    /**
     * Export metrics in Prometheus format
     * @returns {string} Prometheus formatted metrics
     */
    exportPrometheusMetrics() {
        return this.performanceCollector.exportPrometheusMetrics();
    }

    /**
     * Reset all monitoring data
     */
    reset() {
        this.healthMonitor.resetStats();
        this.performanceCollector.resetMetrics();
        this.alertingSystem.clearHistory();
    }

    /**
     * Start alert evaluation loop
     * @private
     */
    _startAlertEvaluation() {
        this.alertEvaluationInterval = setInterval(async () => {
            try {
                const healthStatus = this.healthMonitor.getHealthStatus();
                const performanceMetrics = this.performanceCollector.getPerformanceSummary();
                
                // Combine metrics for alert evaluation
                const combinedMetrics = {
                    ...performanceMetrics.requests,
                    ...performanceMetrics.system,
                    healthStatus: healthStatus.status,
                    activeComponents: healthStatus.summary?.healthyComponents || 0,
                    failedComponents: healthStatus.summary?.failedComponents || 0
                };

                // Evaluate alerts
                this.alertingSystem.evaluateAlerts(combinedMetrics, {
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime()
                });

            } catch (error) {
                console.error('Alert evaluation error:', error);
            }
        }, this.config.alertEvaluationInterval);
    }

    /**
     * Register default alert rules
     * @private
     */
    _registerDefaultAlertRules() {
        // High error rate alert
        this.registerAlertRule('high_error_rate', CommonAlertRules.highErrorRate(0.1));
        
        // High response time alert
        this.registerAlertRule('high_response_time', CommonAlertRules.highResponseTime(5000));
        
        // Service health alert
        this.registerAlertRule('service_unhealthy', {
            condition: (metrics) => metrics.healthStatus === HealthStatus.UNHEALTHY,
            severity: AlertSeverity.CRITICAL,
            message: 'Service health is unhealthy',
            suppressionWindow: 300000
        });

        // Component failures alert
        this.registerAlertRule('component_failures', {
            condition: (metrics) => (metrics.failedComponents || 0) > 0,
            severity: AlertSeverity.ERROR,
            message: 'One or more components are failing: {failedComponents} failed',
            suppressionWindow: 300000
        });
    }
}

// Create default monitoring system instance
const defaultMonitoring = new MonitoringSystem();

module.exports = {
    // Core classes
    HealthMonitor,
    PerformanceCollector,
    AlertingSystem,
    MonitoringSystem,
    
    // Enums and constants
    HealthStatus,
    MetricType,
    AlertSeverity,
    AlertStatus,
    AlertChannel,
    
    // Configurations
    CommonAlertRules,
    
    // Default instance
    defaultMonitoring,
    
    // Convenience methods
    startMonitoring: (config) => {
        if (config) {
            const monitoring = new MonitoringSystem(config);
            monitoring.start();
            return monitoring;
        }
        defaultMonitoring.start();
        return defaultMonitoring;
    },
    
    stopMonitoring: () => defaultMonitoring.stop(),
    getMonitoringStatus: () => defaultMonitoring.getStatus(),
    recordRequest: (method, route, statusCode, duration) => 
        defaultMonitoring.recordRequest(method, route, statusCode, duration),
    recordOperation: (operation, duration, success, errorType) => 
        defaultMonitoring.recordOperation(operation, duration, success, errorType)
};