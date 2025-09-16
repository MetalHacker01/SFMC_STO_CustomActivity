/**
 * Performance Collector
 * Collects and aggregates performance metrics from various system components
 * Provides detailed performance analytics and trend analysis
 */

const { createApiLogger } = require('../logging');

/**
 * Metric Types
 */
const MetricType = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram',
    TIMER: 'timer'
};

/**
 * Performance Collector class for gathering system metrics
 */
class PerformanceCollector {
    constructor(config = {}) {
        this.config = {
            collectionInterval: config.collectionInterval || 60000, // 1 minute
            retentionPeriod: config.retentionPeriod || 86400000, // 24 hours
            maxDataPoints: config.maxDataPoints || 1440, // 24 hours of minute-by-minute data
            enableAutoCollection: config.enableAutoCollection !== false,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'debug' });
        this.metrics = new Map();
        this.timeSeries = new Map();
        this.isCollecting = false;
        this.collectionInterval = null;
        
        // System metrics
        this.systemMetrics = {
            cpu: [],
            memory: [],
            eventLoop: [],
            gc: []
        };

        // Application metrics
        this.applicationMetrics = {
            requests: new Map(),
            responses: new Map(),
            errors: new Map(),
            operations: new Map()
        };

        // Initialize built-in metrics
        this._initializeBuiltInMetrics();
    }

    /**
     * Start performance collection
     */
    startCollection() {
        if (this.isCollecting) {
            this.logger.warn('Performance collection is already running', {}, 'performance-collector');
            return;
        }

        this.isCollecting = true;

        this.logger.info(`Starting performance collection`, {
            interval: this.config.collectionInterval,
            retentionPeriod: this.config.retentionPeriod
        }, 'performance-collector');

        // Perform initial collection
        this._collectSystemMetrics();

        // Schedule periodic collection
        if (this.config.enableAutoCollection) {
            this.collectionInterval = setInterval(() => {
                this._collectSystemMetrics();
                this._cleanupOldData();
            }, this.config.collectionInterval);
        }
    }

    /**
     * Stop performance collection
     */
    stopCollection() {
        if (!this.isCollecting) {
            return;
        }

        this.isCollecting = false;
        
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        this.logger.info('Stopped performance collection', {}, 'performance-collector');
    }

    /**
     * Register a custom metric
     * @param {string} name - Metric name
     * @param {string} type - Metric type
     * @param {Object} config - Metric configuration
     */
    registerMetric(name, type, config = {}) {
        if (!Object.values(MetricType).includes(type)) {
            throw new Error(`Invalid metric type: ${type}`);
        }

        this.metrics.set(name, {
            name,
            type,
            config: {
                description: config.description || '',
                unit: config.unit || '',
                labels: config.labels || [],
                buckets: config.buckets || [0.1, 0.5, 1, 2.5, 5, 10], // For histograms
                ...config
            },
            value: this._getInitialValue(type),
            lastUpdated: null,
            updateCount: 0
        });

        // Initialize time series for this metric
        this.timeSeries.set(name, []);

        this.logger.debug(`Registered metric`, {
            name,
            type,
            description: config.description
        }, 'performance-collector');
    }

    /**
     * Record a metric value
     * @param {string} name - Metric name
     * @param {number} value - Metric value
     * @param {Object} labels - Metric labels
     */
    recordMetric(name, value, labels = {}) {
        const metric = this.metrics.get(name);
        if (!metric) {
            this.logger.warn(`Metric not found: ${name}`, {}, 'performance-collector');
            return;
        }

        const timestamp = Date.now();
        
        // Update metric based on type
        switch (metric.type) {
            case MetricType.COUNTER:
                metric.value += value;
                break;
            case MetricType.GAUGE:
                metric.value = value;
                break;
            case MetricType.HISTOGRAM:
                this._updateHistogram(metric, value);
                break;
            case MetricType.TIMER:
                this._updateTimer(metric, value);
                break;
        }

        metric.lastUpdated = timestamp;
        metric.updateCount++;

        // Add to time series
        const timeSeries = this.timeSeries.get(name);
        timeSeries.push({
            timestamp,
            value: metric.type === MetricType.HISTOGRAM ? metric.value.count : metric.value,
            labels
        });

        // Limit time series size
        if (timeSeries.length > this.config.maxDataPoints) {
            timeSeries.splice(0, timeSeries.length - this.config.maxDataPoints);
        }
    }

    /**
     * Increment a counter metric
     * @param {string} name - Counter name
     * @param {number} increment - Increment value
     * @param {Object} labels - Metric labels
     */
    incrementCounter(name, increment = 1, labels = {}) {
        this.recordMetric(name, increment, labels);
    }

    /**
     * Set a gauge metric
     * @param {string} name - Gauge name
     * @param {number} value - Gauge value
     * @param {Object} labels - Metric labels
     */
    setGauge(name, value, labels = {}) {
        this.recordMetric(name, value, labels);
    }

    /**
     * Record a histogram observation
     * @param {string} name - Histogram name
     * @param {number} value - Observed value
     * @param {Object} labels - Metric labels
     */
    observeHistogram(name, value, labels = {}) {
        this.recordMetric(name, value, labels);
    }

    /**
     * Record a timer measurement
     * @param {string} name - Timer name
     * @param {number} duration - Duration in milliseconds
     * @param {Object} labels - Metric labels
     */
    recordTimer(name, duration, labels = {}) {
        this.recordMetric(name, duration, labels);
    }

    /**
     * Create a timer function
     * @param {string} name - Timer name
     * @param {Object} labels - Metric labels
     * @returns {Function} Timer function
     */
    createTimer(name, labels = {}) {
        const startTime = Date.now();
        
        return () => {
            const duration = Date.now() - startTime;
            this.recordTimer(name, duration, labels);
            return duration;
        };
    }

    /**
     * Record application request metrics
     * @param {string} method - HTTP method
     * @param {string} route - Route path
     * @param {number} statusCode - Response status code
     * @param {number} duration - Request duration
     */
    recordRequest(method, route, statusCode, duration) {
        const labels = { method, route, status: statusCode.toString() };
        
        // Record request count
        this.incrementCounter('http_requests_total', 1, labels);
        
        // Record request duration
        this.recordTimer('http_request_duration_ms', duration, labels);
        
        // Record response status
        this.incrementCounter('http_responses_total', 1, { status: statusCode.toString() });
        
        // Record errors if status >= 400
        if (statusCode >= 400) {
            this.incrementCounter('http_errors_total', 1, { 
                status: statusCode.toString(),
                error_type: statusCode >= 500 ? 'server_error' : 'client_error'
            });
        }
    }

    /**
     * Record operation metrics
     * @param {string} operation - Operation name
     * @param {number} duration - Operation duration
     * @param {boolean} success - Whether operation succeeded
     * @param {string} errorType - Error type if failed
     */
    recordOperation(operation, duration, success = true, errorType = null) {
        const labels = { operation };
        
        // Record operation count
        this.incrementCounter('operations_total', 1, { ...labels, success: success.toString() });
        
        // Record operation duration
        this.recordTimer('operation_duration_ms', duration, labels);
        
        // Record errors
        if (!success) {
            this.incrementCounter('operation_errors_total', 1, { 
                ...labels, 
                error_type: errorType || 'unknown'
            });
        }
    }

    /**
     * Get current metric value
     * @param {string} name - Metric name
     * @returns {*} Current metric value
     */
    getMetric(name) {
        const metric = this.metrics.get(name);
        return metric ? metric.value : null;
    }

    /**
     * Get all metrics
     * @returns {Object} All current metrics
     */
    getAllMetrics() {
        const result = {};
        
        for (const [name, metric] of this.metrics) {
            result[name] = {
                type: metric.type,
                value: metric.value,
                lastUpdated: metric.lastUpdated,
                updateCount: metric.updateCount,
                config: metric.config
            };
        }
        
        return result;
    }

    /**
     * Get time series data for a metric
     * @param {string} name - Metric name
     * @param {number} duration - Duration in milliseconds
     * @returns {Array} Time series data
     */
    getTimeSeries(name, duration = 3600000) { // Default 1 hour
        const timeSeries = this.timeSeries.get(name);
        if (!timeSeries) {
            return [];
        }

        const cutoff = Date.now() - duration;
        return timeSeries.filter(point => point.timestamp >= cutoff);
    }

    /**
     * Get performance summary
     * @returns {Object} Performance summary
     */
    getPerformanceSummary() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        
        // Calculate request rate
        const requestSeries = this.getTimeSeries('http_requests_total', 3600000);
        const requestRate = requestSeries.length > 0 
            ? (requestSeries.length / 60).toFixed(2) // requests per minute
            : 0;

        // Calculate error rate
        const errorSeries = this.getTimeSeries('http_errors_total', 3600000);
        const errorRate = requestSeries.length > 0 
            ? ((errorSeries.length / requestSeries.length) * 100).toFixed(2)
            : 0;

        // Get average response time from histogram
        const durationMetric = this.getMetric('http_request_duration_ms');
        const avgResponseTime = durationMetric && durationMetric.count > 0
            ? (durationMetric.sum / durationMetric.count).toFixed(2)
            : 0;

        // Get system metrics
        const latestSystemMetrics = this._getLatestSystemMetrics();

        return {
            timestamp: new Date().toISOString(),
            requests: {
                rate: `${requestRate}/min`,
                total: requestSeries.length,
                errorRate: `${errorRate}%`,
                avgResponseTime: `${avgResponseTime}ms`
            },
            system: latestSystemMetrics,
            uptime: process.uptime(),
            isCollecting: this.isCollecting
        };
    }

    /**
     * Export metrics in Prometheus format
     * @returns {string} Prometheus formatted metrics
     */
    exportPrometheusMetrics() {
        let output = '';
        
        for (const [name, metric] of this.metrics) {
            // Add metric help and type
            if (metric.config.description) {
                output += `# HELP ${name} ${metric.config.description}\n`;
            }
            output += `# TYPE ${name} ${metric.type}\n`;
            
            // Add metric value(s)
            if (metric.type === MetricType.HISTOGRAM) {
                // Export histogram buckets
                for (const [bucket, count] of Object.entries(metric.value.buckets)) {
                    output += `${name}_bucket{le="${bucket}"} ${count}\n`;
                }
                output += `${name}_bucket{le="+Inf"} ${metric.value.count}\n`;
                output += `${name}_sum ${metric.value.sum}\n`;
                output += `${name}_count ${metric.value.count}\n`;
            } else {
                output += `${name} ${metric.value}\n`;
            }
            
            output += '\n';
        }
        
        return output;
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        for (const [name, metric] of this.metrics) {
            metric.value = this._getInitialValue(metric.type);
            metric.lastUpdated = null;
            metric.updateCount = 0;
        }
        
        // Clear time series
        for (const [name] of this.timeSeries) {
            this.timeSeries.set(name, []);
        }
        
        // Clear system metrics
        this.systemMetrics = {
            cpu: [],
            memory: [],
            eventLoop: [],
            gc: []
        };

        this.logger.info('All metrics reset', {}, 'performance-collector');
    }

    /**
     * Initialize built-in metrics
     * @private
     */
    _initializeBuiltInMetrics() {
        // HTTP metrics
        this.registerMetric('http_requests_total', MetricType.COUNTER, {
            description: 'Total number of HTTP requests',
            labels: ['method', 'route', 'status']
        });

        this.registerMetric('http_request_duration_ms', MetricType.HISTOGRAM, {
            description: 'HTTP request duration in milliseconds',
            unit: 'ms',
            labels: ['method', 'route']
        });

        this.registerMetric('http_responses_total', MetricType.COUNTER, {
            description: 'Total number of HTTP responses by status',
            labels: ['status']
        });

        this.registerMetric('http_errors_total', MetricType.COUNTER, {
            description: 'Total number of HTTP errors',
            labels: ['status', 'error_type']
        });

        // Operation metrics
        this.registerMetric('operations_total', MetricType.COUNTER, {
            description: 'Total number of operations',
            labels: ['operation', 'success']
        });

        this.registerMetric('operation_duration_ms', MetricType.HISTOGRAM, {
            description: 'Operation duration in milliseconds',
            unit: 'ms',
            labels: ['operation']
        });

        this.registerMetric('operation_errors_total', MetricType.COUNTER, {
            description: 'Total number of operation errors',
            labels: ['operation', 'error_type']
        });

        // System metrics
        this.registerMetric('process_cpu_usage_percent', MetricType.GAUGE, {
            description: 'Process CPU usage percentage',
            unit: 'percent'
        });

        this.registerMetric('process_memory_usage_bytes', MetricType.GAUGE, {
            description: 'Process memory usage in bytes',
            unit: 'bytes'
        });

        this.registerMetric('nodejs_eventloop_lag_ms', MetricType.GAUGE, {
            description: 'Node.js event loop lag in milliseconds',
            unit: 'ms'
        });
    }

    /**
     * Get initial value for metric type
     * @private
     */
    _getInitialValue(type) {
        switch (type) {
            case MetricType.COUNTER:
                return 0;
            case MetricType.GAUGE:
                return 0;
            case MetricType.HISTOGRAM:
                return {
                    buckets: {},
                    sum: 0,
                    count: 0
                };
            case MetricType.TIMER:
                return {
                    count: 0,
                    sum: 0,
                    min: Infinity,
                    max: 0,
                    avg: 0
                };
            default:
                return 0;
        }
    }

    /**
     * Update histogram metric
     * @private
     */
    _updateHistogram(metric, value) {
        const histogram = metric.value;
        histogram.count++;
        histogram.sum += value;

        // Update buckets
        for (const bucket of metric.config.buckets) {
            if (value <= bucket) {
                histogram.buckets[bucket] = (histogram.buckets[bucket] || 0) + 1;
            }
        }
    }

    /**
     * Update timer metric
     * @private
     */
    _updateTimer(metric, value) {
        const timer = metric.value;
        timer.count++;
        timer.sum += value;
        timer.min = Math.min(timer.min, value);
        timer.max = Math.max(timer.max, value);
        timer.avg = timer.sum / timer.count;
    }

    /**
     * Collect system metrics
     * @private
     */
    _collectSystemMetrics() {
        const timestamp = Date.now();

        try {
            // Memory usage
            const memUsage = process.memoryUsage();
            this.setGauge('process_memory_usage_bytes', memUsage.rss);
            
            this.systemMetrics.memory.push({
                timestamp,
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external
            });

            // CPU usage (approximation)
            const cpuUsage = process.cpuUsage();
            const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
            this.setGauge('process_cpu_usage_percent', cpuPercent);

            // Event loop lag
            const start = process.hrtime.bigint();
            setImmediate(() => {
                const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
                this.setGauge('nodejs_eventloop_lag_ms', lag);
            });

        } catch (error) {
            this.logger.error('Failed to collect system metrics', {
                error: error.message
            }, 'performance-collector');
        }

        // Cleanup old system metrics
        this._cleanupSystemMetrics();
    }

    /**
     * Get latest system metrics
     * @private
     */
    _getLatestSystemMetrics() {
        const latest = {
            memory: this.systemMetrics.memory[this.systemMetrics.memory.length - 1],
            cpu: this.getMetric('process_cpu_usage_percent'),
            eventLoopLag: this.getMetric('nodejs_eventloop_lag_ms')
        };

        return latest;
    }

    /**
     * Cleanup old system metrics
     * @private
     */
    _cleanupSystemMetrics() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        
        this.systemMetrics.memory = this.systemMetrics.memory.filter(m => m.timestamp >= cutoff);
        this.systemMetrics.cpu = this.systemMetrics.cpu.filter(c => c.timestamp >= cutoff);
        this.systemMetrics.eventLoop = this.systemMetrics.eventLoop.filter(e => e.timestamp >= cutoff);
    }

    /**
     * Cleanup old time series data
     * @private
     */
    _cleanupOldData() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        
        for (const [name, timeSeries] of this.timeSeries) {
            const filtered = timeSeries.filter(point => point.timestamp >= cutoff);
            this.timeSeries.set(name, filtered);
        }
    }
}

module.exports = {
    PerformanceCollector,
    MetricType
};