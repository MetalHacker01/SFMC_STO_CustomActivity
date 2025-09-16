/**
 * Performance Monitor
 * Monitors and tracks performance metrics for the execution engine
 * Provides timing metrics, resource usage tracking, and performance alerts
 */

/**
 * Performance Monitor class for tracking execution performance
 */
class PerformanceMonitor {
    constructor(config = {}, logger = console) {
        this.logger = logger;
        this.config = {
            enableResourceMonitoring: config.enableResourceMonitoring !== false,
            performanceThresholds: {
                slowProcessing: config.slowProcessingThreshold || 5000, // 5 seconds
                verySlowProcessing: config.verySlowProcessingThreshold || 10000, // 10 seconds
                highMemoryUsage: config.highMemoryUsageThreshold || 100 * 1024 * 1024, // 100MB
                ...config.performanceThresholds
            },
            alerting: {
                enabled: config.alertingEnabled !== false,
                slowProcessingAlerts: config.slowProcessingAlerts !== false,
                memoryAlerts: config.memoryAlerts !== false,
                ...config.alerting
            },
            ...config
        };

        // Performance metrics
        this.metrics = {
            // Timing metrics
            processingTimes: [],
            stepTimes: {
                timezoneCalculation: [],
                holidayChecking: [],
                timeWindowProcessing: [],
                dataExtensionUpdate: []
            },
            
            // Throughput metrics
            throughput: {
                contactsPerSecond: 0,
                contactsPerMinute: 0,
                contactsPerHour: 0,
                lastCalculated: null
            },
            
            // Resource metrics
            memory: {
                current: 0,
                peak: 0,
                samples: []
            },
            
            // Error metrics
            errorRates: {
                overall: 0,
                byType: {},
                lastCalculated: null
            },
            
            // Performance alerts
            alerts: [],
            
            // Statistics
            totalProcessed: 0,
            startTime: Date.now()
        };

        // Start resource monitoring if enabled
        if (this.config.enableResourceMonitoring) {
            this._startResourceMonitoring();
        }
    }

    /**
     * Record processing start
     * @param {string} processingId - Processing identifier
     * @param {Object} metadata - Additional metadata
     */
    recordProcessingStart(processingId, metadata = {}) {
        const record = {
            processingId,
            startTime: Date.now(),
            metadata,
            steps: {}
        };

        this.activeProcessing = this.activeProcessing || new Map();
        this.activeProcessing.set(processingId, record);

        // Record memory usage at start
        if (this.config.enableResourceMonitoring) {
            this._recordMemoryUsage();
        }
    }

    /**
     * Record processing completion
     * @param {string} processingId - Processing identifier
     * @param {boolean} success - Whether processing was successful
     * @param {Object} result - Processing result
     */
    recordProcessingComplete(processingId, success, result = {}) {
        if (!this.activeProcessing || !this.activeProcessing.has(processingId)) {
            this.logger.warn(`No active processing record found for ${processingId}`);
            return;
        }

        const record = this.activeProcessing.get(processingId);
        const processingTime = Date.now() - record.startTime;

        // Update metrics
        this.metrics.processingTimes.push({
            processingId,
            duration: processingTime,
            success,
            timestamp: new Date().toISOString(),
            adjustments: result.adjustments?.length || 0
        });

        this.metrics.totalProcessed++;

        // Trim processing times array to keep only recent entries
        if (this.metrics.processingTimes.length > 1000) {
            this.metrics.processingTimes = this.metrics.processingTimes.slice(-1000);
        }

        // Check for performance issues
        this._checkPerformanceThresholds(processingId, processingTime, success);

        // Update throughput metrics
        this._updateThroughputMetrics();

        // Clean up active processing
        this.activeProcessing.delete(processingId);

        this.logger.debug(`Performance recorded for ${processingId}`, {
            processingTime: `${processingTime}ms`,
            success,
            adjustments: result.adjustments?.length || 0
        });
    }

    /**
     * Record step timing
     * @param {string} processingId - Processing identifier
     * @param {string} stepName - Step name
     * @param {number} duration - Duration in milliseconds
     * @param {boolean} success - Whether step was successful
     */
    recordStepTiming(processingId, stepName, duration, success = true) {
        const stepKey = this._normalizeStepName(stepName);
        
        if (!this.metrics.stepTimes[stepKey]) {
            this.metrics.stepTimes[stepKey] = [];
        }

        this.metrics.stepTimes[stepKey].push({
            processingId,
            duration,
            success,
            timestamp: new Date().toISOString()
        });

        // Trim step times array
        if (this.metrics.stepTimes[stepKey].length > 500) {
            this.metrics.stepTimes[stepKey] = this.metrics.stepTimes[stepKey].slice(-500);
        }

        // Update active processing record
        if (this.activeProcessing && this.activeProcessing.has(processingId)) {
            const record = this.activeProcessing.get(processingId);
            record.steps[stepKey] = { duration, success };
        }
    }

    /**
     * Record error occurrence
     * @param {string} processingId - Processing identifier
     * @param {string} errorType - Type of error
     * @param {string} errorMessage - Error message
     */
    recordError(processingId, errorType, errorMessage) {
        const errorRecord = {
            processingId,
            errorType,
            errorMessage,
            timestamp: new Date().toISOString()
        };

        // Update error rates
        if (!this.metrics.errorRates.byType[errorType]) {
            this.metrics.errorRates.byType[errorType] = 0;
        }
        this.metrics.errorRates.byType[errorType]++;

        this.logger.debug(`Error recorded for ${processingId}`, {
            errorType,
            errorMessage
        });
    }

    /**
     * Get current performance statistics
     * @returns {Object} Performance statistics
     */
    getPerformanceStats() {
        const now = Date.now();
        const uptime = now - this.metrics.startTime;

        return {
            uptime: uptime,
            totalProcessed: this.metrics.totalProcessed,
            
            // Processing time statistics
            processingTime: this._calculateProcessingTimeStats(),
            
            // Step timing statistics
            stepTiming: this._calculateStepTimingStats(),
            
            // Throughput statistics
            throughput: this._calculateThroughputStats(),
            
            // Memory statistics
            memory: this._calculateMemoryStats(),
            
            // Error statistics
            errors: this._calculateErrorStats(),
            
            // Recent alerts
            recentAlerts: this.metrics.alerts.slice(-10),
            
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get performance summary for monitoring dashboards
     * @returns {Object} Performance summary
     */
    getPerformanceSummary() {
        const stats = this.getPerformanceStats();
        
        return {
            status: this._determineOverallStatus(stats),
            totalProcessed: stats.totalProcessed,
            averageProcessingTime: stats.processingTime.average,
            successRate: stats.errors.successRate,
            throughput: stats.throughput.contactsPerMinute,
            memoryUsage: stats.memory.current,
            activeAlerts: this.metrics.alerts.filter(alert => 
                Date.now() - new Date(alert.timestamp).getTime() < 300000 // 5 minutes
            ).length,
            timestamp: stats.timestamp
        };
    }

    /**
     * Reset all performance metrics
     */
    reset() {
        this.metrics = {
            processingTimes: [],
            stepTimes: {
                timezoneCalculation: [],
                holidayChecking: [],
                timeWindowProcessing: [],
                dataExtensionUpdate: []
            },
            throughput: {
                contactsPerSecond: 0,
                contactsPerMinute: 0,
                contactsPerHour: 0,
                lastCalculated: null
            },
            memory: {
                current: 0,
                peak: 0,
                samples: []
            },
            errorRates: {
                overall: 0,
                byType: {},
                lastCalculated: null
            },
            alerts: [],
            totalProcessed: 0,
            startTime: Date.now()
        };

        if (this.activeProcessing) {
            this.activeProcessing.clear();
        }

        this.logger.info('Performance metrics reset');
    }

    /**
     * Start resource monitoring
     * @private
     */
    _startResourceMonitoring() {
        // Monitor memory usage every 30 seconds
        this.resourceMonitorInterval = setInterval(() => {
            this._recordMemoryUsage();
        }, 30000);

        this.logger.debug('Resource monitoring started');
    }

    /**
     * Stop resource monitoring
     */
    stopResourceMonitoring() {
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
            this.resourceMonitorInterval = null;
        }

        this.logger.debug('Resource monitoring stopped');
    }

    /**
     * Record current memory usage
     * @private
     */
    _recordMemoryUsage() {
        try {
            const memUsage = process.memoryUsage();
            const currentMemory = memUsage.heapUsed;

            this.metrics.memory.current = currentMemory;
            
            if (currentMemory > this.metrics.memory.peak) {
                this.metrics.memory.peak = currentMemory;
            }

            this.metrics.memory.samples.push({
                timestamp: new Date().toISOString(),
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            });

            // Keep only recent samples
            if (this.metrics.memory.samples.length > 100) {
                this.metrics.memory.samples = this.metrics.memory.samples.slice(-100);
            }

            // Check for memory alerts
            if (this.config.alerting.memoryAlerts && currentMemory > this.config.performanceThresholds.highMemoryUsage) {
                this._createAlert('high_memory_usage', `Memory usage: ${Math.round(currentMemory / 1024 / 1024)}MB`);
            }

        } catch (error) {
            this.logger.warn('Failed to record memory usage:', error.message);
        }
    }

    /**
     * Check performance thresholds and create alerts
     * @private
     */
    _checkPerformanceThresholds(processingId, processingTime, success) {
        if (!this.config.alerting.enabled) {
            return;
        }

        // Check for slow processing
        if (this.config.alerting.slowProcessingAlerts) {
            if (processingTime > this.config.performanceThresholds.verySlowProcessing) {
                this._createAlert('very_slow_processing', `Processing took ${processingTime}ms for ${processingId}`);
            } else if (processingTime > this.config.performanceThresholds.slowProcessing) {
                this._createAlert('slow_processing', `Processing took ${processingTime}ms for ${processingId}`);
            }
        }
    }

    /**
     * Create performance alert
     * @private
     */
    _createAlert(type, message, metadata = {}) {
        const alert = {
            type,
            message,
            metadata,
            timestamp: new Date().toISOString(),
            severity: this._getAlertSeverity(type)
        };

        this.metrics.alerts.push(alert);

        // Keep only recent alerts
        if (this.metrics.alerts.length > 100) {
            this.metrics.alerts = this.metrics.alerts.slice(-100);
        }

        this.logger.warn(`Performance alert: ${type} - ${message}`, metadata);
    }

    /**
     * Get alert severity
     * @private
     */
    _getAlertSeverity(type) {
        const severityMap = {
            'very_slow_processing': 'high',
            'slow_processing': 'medium',
            'high_memory_usage': 'medium',
            'high_error_rate': 'high'
        };

        return severityMap[type] || 'low';
    }

    /**
     * Calculate processing time statistics
     * @private
     */
    _calculateProcessingTimeStats() {
        if (this.metrics.processingTimes.length === 0) {
            return { average: 0, min: 0, max: 0, median: 0, count: 0 };
        }

        const times = this.metrics.processingTimes.map(t => t.duration);
        const sorted = times.sort((a, b) => a - b);

        return {
            average: Math.round(times.reduce((sum, time) => sum + time, 0) / times.length),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            median: sorted[Math.floor(sorted.length / 2)],
            count: times.length,
            percentile95: sorted[Math.floor(sorted.length * 0.95)]
        };
    }

    /**
     * Calculate step timing statistics
     * @private
     */
    _calculateStepTimingStats() {
        const stepStats = {};

        Object.keys(this.metrics.stepTimes).forEach(stepName => {
            const times = this.metrics.stepTimes[stepName];
            if (times.length === 0) {
                stepStats[stepName] = { average: 0, count: 0 };
                return;
            }

            const durations = times.map(t => t.duration);
            stepStats[stepName] = {
                average: Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length),
                min: Math.min(...durations),
                max: Math.max(...durations),
                count: durations.length
            };
        });

        return stepStats;
    }

    /**
     * Calculate throughput statistics
     * @private
     */
    _calculateThroughputStats() {
        const now = Date.now();
        const uptime = now - this.metrics.startTime;

        if (uptime === 0) {
            return { contactsPerSecond: 0, contactsPerMinute: 0, contactsPerHour: 0 };
        }

        const contactsPerSecond = this.metrics.totalProcessed / (uptime / 1000);
        
        return {
            contactsPerSecond: Math.round(contactsPerSecond * 100) / 100,
            contactsPerMinute: Math.round(contactsPerSecond * 60 * 100) / 100,
            contactsPerHour: Math.round(contactsPerSecond * 3600 * 100) / 100
        };
    }

    /**
     * Calculate memory statistics
     * @private
     */
    _calculateMemoryStats() {
        return {
            current: Math.round(this.metrics.memory.current / 1024 / 1024), // MB
            peak: Math.round(this.metrics.memory.peak / 1024 / 1024), // MB
            samplesCount: this.metrics.memory.samples.length
        };
    }

    /**
     * Calculate error statistics
     * @private
     */
    _calculateErrorStats() {
        const totalErrors = Object.values(this.metrics.errorRates.byType).reduce((sum, count) => sum + count, 0);
        const successRate = this.metrics.totalProcessed > 0 
            ? Math.round(((this.metrics.totalProcessed - totalErrors) / this.metrics.totalProcessed) * 100 * 100) / 100
            : 100;

        return {
            totalErrors,
            successRate,
            errorsByType: this.metrics.errorRates.byType
        };
    }

    /**
     * Determine overall system status
     * @private
     */
    _determineOverallStatus(stats) {
        // Check for critical issues
        if (stats.errors.successRate < 90) {
            return 'critical';
        }

        if (stats.processingTime.average > this.config.performanceThresholds.verySlowProcessing) {
            return 'critical';
        }

        // Check for warnings
        if (stats.errors.successRate < 95) {
            return 'warning';
        }

        if (stats.processingTime.average > this.config.performanceThresholds.slowProcessing) {
            return 'warning';
        }

        if (stats.memory.current > this.config.performanceThresholds.highMemoryUsage / 1024 / 1024) {
            return 'warning';
        }

        return 'healthy';
    }

    /**
     * Normalize step name for consistent tracking
     * @private
     */
    _normalizeStepName(stepName) {
        const nameMap = {
            'timezone_calculation': 'timezoneCalculation',
            'holiday_check': 'holidayChecking',
            'time_window_processing': 'timeWindowProcessing',
            'data_extension_update': 'dataExtensionUpdate'
        };

        return nameMap[stepName] || stepName;
    }

    /**
     * Update throughput metrics
     * @private
     */
    _updateThroughputMetrics() {
        const now = Date.now();
        this.metrics.throughput.lastCalculated = now;
        
        // Calculate throughput based on recent processing
        const recentProcessing = this.metrics.processingTimes.filter(p => 
            now - new Date(p.timestamp).getTime() < 60000 // Last minute
        );

        if (recentProcessing.length > 0) {
            this.metrics.throughput.contactsPerMinute = recentProcessing.length;
            this.metrics.throughput.contactsPerSecond = Math.round(recentProcessing.length / 60 * 100) / 100;
            this.metrics.throughput.contactsPerHour = recentProcessing.length * 60;
        }
    }
}

module.exports = PerformanceMonitor;