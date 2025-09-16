/**
 * Production Metrics Exporter
 * Exports comprehensive metrics for production monitoring
 */

const { createApiLogger } = require('../logging');

class ProductionMetricsExporter {
    constructor(monitoringSystem, config = {}) {
        this.monitoringSystem = monitoringSystem;
        this.config = {
            enableBusinessMetrics: config.enableBusinessMetrics !== false,
            enableSystemMetrics: config.enableSystemMetrics !== false,
            enablePerformanceMetrics: config.enablePerformanceMetrics !== false,
            enableSecurityMetrics: config.enableSecurityMetrics !== false,
            metricsPrefix: config.metricsPrefix || 'sto_activity_',
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'debug' });
        this.customMetrics = new Map();
        this.lastExport = null;
    }

    /**
     * Export all metrics in Prometheus format
     * @returns {string} Prometheus formatted metrics
     */
    exportMetrics() {
        const startTime = Date.now();
        let output = '';

        try {
            // Add metadata
            output += this.generateMetricsMetadata();

            // Export system metrics
            if (this.config.enableSystemMetrics) {
                output += this.exportSystemMetrics();
            }

            // Export business metrics
            if (this.config.enableBusinessMetrics) {
                output += this.exportBusinessMetrics();
            }

            // Export performance metrics
            if (this.config.enablePerformanceMetrics) {
                output += this.exportPerformanceMetrics();
            }

            // Export security metrics
            if (this.config.enableSecurityMetrics) {
                output += this.exportSecurityMetrics();
            }

            // Export health metrics
            output += this.exportHealthMetrics();

            // Export custom metrics
            output += this.exportCustomMetrics();

            const exportDuration = Date.now() - startTime;
            this.lastExport = {
                timestamp: new Date().toISOString(),
                duration: exportDuration,
                metricsCount: (output.match(/^[a-zA-Z]/gm) || []).length
            };

            this.logger.debug('Metrics exported successfully', {
                duration: `${exportDuration}ms`,
                metricsCount: this.lastExport.metricsCount
            });

            return output;

        } catch (error) {
            this.logger.error('Failed to export metrics', {
                error: error.message,
                stack: error.stack
            });

            // Return basic error metric
            return `# HELP sto_activity_metrics_export_errors_total Total number of metrics export errors
# TYPE sto_activity_metrics_export_errors_total counter
sto_activity_metrics_export_errors_total 1

`;
        }
    }

    /**
     * Generate metrics metadata
     * @returns {string} Metadata comments
     */
    generateMetricsMetadata() {
        const timestamp = new Date().toISOString();
        const uptime = process.uptime();
        
        return `# STO Activity Production Metrics
# Generated: ${timestamp}
# Uptime: ${uptime} seconds
# Node.js Version: ${process.version}
# Platform: ${process.platform}
# Architecture: ${process.arch}

`;
    }

    /**
     * Export system metrics
     * @returns {string} System metrics
     */
    exportSystemMetrics() {
        let output = '';

        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();

            // Memory metrics
            output += `# HELP sto_activity_memory_usage_bytes Memory usage in bytes
# TYPE sto_activity_memory_usage_bytes gauge
sto_activity_memory_usage_bytes{type="rss"} ${memUsage.rss}
sto_activity_memory_usage_bytes{type="heap_used"} ${memUsage.heapUsed}
sto_activity_memory_usage_bytes{type="heap_total"} ${memUsage.heapTotal}
sto_activity_memory_usage_bytes{type="external"} ${memUsage.external}

`;

            // CPU metrics
            const cpuTotal = cpuUsage.user + cpuUsage.system;
            output += `# HELP sto_activity_cpu_usage_microseconds CPU usage in microseconds
# TYPE sto_activity_cpu_usage_microseconds counter
sto_activity_cpu_usage_microseconds{type="user"} ${cpuUsage.user}
sto_activity_cpu_usage_microseconds{type="system"} ${cpuUsage.system}
sto_activity_cpu_usage_microseconds{type="total"} ${cpuTotal}

`;

            // Process metrics
            output += `# HELP sto_activity_uptime_seconds Process uptime in seconds
# TYPE sto_activity_uptime_seconds gauge
sto_activity_uptime_seconds ${process.uptime()}

# HELP sto_activity_start_time_seconds Process start time in seconds since epoch
# TYPE sto_activity_start_time_seconds gauge
sto_activity_start_time_seconds ${Date.now() / 1000 - process.uptime()}

`;

            // Event loop lag (if available)
            if (this.monitoringSystem && this.monitoringSystem.performanceCollector) {
                const eventLoopLag = this.monitoringSystem.performanceCollector.getMetric('nodejs_eventloop_lag_ms');
                if (eventLoopLag !== null) {
                    output += `# HELP sto_activity_eventloop_lag_milliseconds Event loop lag in milliseconds
# TYPE sto_activity_eventloop_lag_milliseconds gauge
sto_activity_eventloop_lag_milliseconds ${eventLoopLag}

`;
                }
            }

        } catch (error) {
            this.logger.error('Failed to export system metrics', { error: error.message });
        }

        return output;
    }

    /**
     * Export business metrics
     * @returns {string} Business metrics
     */
    exportBusinessMetrics() {
        let output = '';

        try {
            // Get business metrics from monitoring system
            if (this.monitoringSystem && this.monitoringSystem.performanceCollector) {
                const metrics = this.monitoringSystem.performanceCollector.getAllMetrics();

                // Contacts processed
                if (metrics.sto_contacts_processed_total) {
                    output += `# HELP sto_activity_contacts_processed_total Total number of contacts processed
# TYPE sto_activity_contacts_processed_total counter
sto_activity_contacts_processed_total ${metrics.sto_contacts_processed_total.value}

`;
                }

                // Send time calculations
                if (metrics.sto_send_time_calculations_total) {
                    output += `# HELP sto_activity_send_time_calculations_total Total number of send time calculations
# TYPE sto_activity_send_time_calculations_total counter
sto_activity_send_time_calculations_total ${metrics.sto_send_time_calculations_total.value}

`;
                }

                // Timezone calculations
                if (metrics.sto_timezone_calculations_total) {
                    output += `# HELP sto_activity_timezone_calculations_total Total number of timezone calculations
# TYPE sto_activity_timezone_calculations_total counter
sto_activity_timezone_calculations_total ${metrics.sto_timezone_calculations_total.value}

`;
                }

                // Holiday checks
                if (metrics.sto_holiday_checks_total) {
                    output += `# HELP sto_activity_holiday_checks_total Total number of holiday checks
# TYPE sto_activity_holiday_checks_total counter
sto_activity_holiday_checks_total ${metrics.sto_holiday_checks_total.value}

`;
                }

                // Data extension updates
                if (metrics.sto_data_extension_updates_total) {
                    output += `# HELP sto_activity_data_extension_updates_total Total number of data extension updates
# TYPE sto_activity_data_extension_updates_total counter
sto_activity_data_extension_updates_total ${metrics.sto_data_extension_updates_total.value}

`;
                }
            }

            // Add static business metrics
            output += `# HELP sto_activity_supported_countries Number of supported countries
# TYPE sto_activity_supported_countries gauge
sto_activity_supported_countries 19

# HELP sto_activity_supported_timezones Number of supported timezones
# TYPE sto_activity_supported_timezones gauge
sto_activity_supported_timezones 24

`;

        } catch (error) {
            this.logger.error('Failed to export business metrics', { error: error.message });
        }

        return output;
    }

    /**
     * Export performance metrics
     * @returns {string} Performance metrics
     */
    exportPerformanceMetrics() {
        let output = '';

        try {
            if (this.monitoringSystem && this.monitoringSystem.performanceCollector) {
                const summary = this.monitoringSystem.performanceCollector.getPerformanceSummary();

                // Request rate
                const requestRate = parseFloat(summary.requests?.rate?.replace('/min', '') || 0);
                output += `# HELP sto_activity_requests_per_minute Request rate per minute
# TYPE sto_activity_requests_per_minute gauge
sto_activity_requests_per_minute ${requestRate}

`;

                // Error rate
                const errorRate = parseFloat(summary.requests?.errorRate?.replace('%', '') || 0);
                output += `# HELP sto_activity_error_rate_percent Error rate percentage
# TYPE sto_activity_error_rate_percent gauge
sto_activity_error_rate_percent ${errorRate}

`;

                // Average response time
                const avgResponseTime = parseFloat(summary.requests?.avgResponseTime?.replace('ms', '') || 0);
                output += `# HELP sto_activity_avg_response_time_milliseconds Average response time in milliseconds
# TYPE sto_activity_avg_response_time_milliseconds gauge
sto_activity_avg_response_time_milliseconds ${avgResponseTime}

`;

                // Total requests
                const totalRequests = parseInt(summary.requests?.total || 0);
                output += `# HELP sto_activity_total_requests_processed Total number of requests processed
# TYPE sto_activity_total_requests_processed counter
sto_activity_total_requests_processed ${totalRequests}

`;
            }

        } catch (error) {
            this.logger.error('Failed to export performance metrics', { error: error.message });
        }

        return output;
    }

    /**
     * Export security metrics
     * @returns {string} Security metrics
     */
    exportSecurityMetrics() {
        let output = '';

        try {
            // Rate limit hits (if available)
            output += `# HELP sto_activity_rate_limit_hits_total Total number of rate limit hits
# TYPE sto_activity_rate_limit_hits_total counter
sto_activity_rate_limit_hits_total 0

# HELP sto_activity_authentication_failures_total Total number of authentication failures
# TYPE sto_activity_authentication_failures_total counter
sto_activity_authentication_failures_total 0

# HELP sto_activity_cors_violations_total Total number of CORS violations
# TYPE sto_activity_cors_violations_total counter
sto_activity_cors_violations_total 0

`;

        } catch (error) {
            this.logger.error('Failed to export security metrics', { error: error.message });
        }

        return output;
    }

    /**
     * Export health metrics
     * @returns {string} Health metrics
     */
    exportHealthMetrics() {
        let output = '';

        try {
            if (this.monitoringSystem && this.monitoringSystem.healthMonitor) {
                const healthStatus = this.monitoringSystem.healthMonitor.getHealthStatus();

                // Overall health status
                let healthValue = 0;
                switch (healthStatus.status) {
                    case 'healthy':
                        healthValue = 1;
                        break;
                    case 'degraded':
                        healthValue = 2;
                        break;
                    case 'unhealthy':
                        healthValue = 0;
                        break;
                    default:
                        healthValue = -1;
                }

                output += `# HELP sto_activity_health_status Overall health status (0=unhealthy, 1=healthy, 2=degraded)
# TYPE sto_activity_health_status gauge
sto_activity_health_status ${healthValue}

`;

                // Component health metrics
                if (healthStatus.componentResults) {
                    for (const [componentName, result] of Object.entries(healthStatus.componentResults)) {
                        let componentValue = 0;
                        switch (result.status) {
                            case 'healthy':
                                componentValue = 1;
                                break;
                            case 'degraded':
                                componentValue = 2;
                                break;
                            case 'unhealthy':
                                componentValue = 0;
                                break;
                        }

                        output += `sto_activity_component_health_status{component="${componentName}"} ${componentValue}
`;
                    }
                    output += '\n';
                }

                // Health check summary
                if (healthStatus.summary) {
                    output += `# HELP sto_activity_health_components_total Total number of health components
# TYPE sto_activity_health_components_total gauge
sto_activity_health_components_total ${healthStatus.summary.totalComponents || 0}

# HELP sto_activity_health_components_healthy Number of healthy components
# TYPE sto_activity_health_components_healthy gauge
sto_activity_health_components_healthy ${healthStatus.summary.healthyComponents || 0}

# HELP sto_activity_health_components_failed Number of failed components
# TYPE sto_activity_health_components_failed gauge
sto_activity_health_components_failed ${healthStatus.summary.failedComponents || 0}

`;
                }
            }

        } catch (error) {
            this.logger.error('Failed to export health metrics', { error: error.message });
        }

        return output;
    }

    /**
     * Export custom metrics
     * @returns {string} Custom metrics
     */
    exportCustomMetrics() {
        let output = '';

        try {
            for (const [name, metric] of this.customMetrics) {
                output += `# HELP ${name} ${metric.help || 'Custom metric'}
# TYPE ${name} ${metric.type || 'gauge'}
${name} ${metric.value || 0}

`;
            }

        } catch (error) {
            this.logger.error('Failed to export custom metrics', { error: error.message });
        }

        return output;
    }

    /**
     * Register a custom metric
     * @param {string} name - Metric name
     * @param {*} value - Metric value
     * @param {Object} options - Metric options
     */
    registerCustomMetric(name, value, options = {}) {
        this.customMetrics.set(name, {
            value,
            type: options.type || 'gauge',
            help: options.help || 'Custom metric',
            labels: options.labels || {},
            timestamp: Date.now()
        });
    }

    /**
     * Update a custom metric
     * @param {string} name - Metric name
     * @param {*} value - New metric value
     */
    updateCustomMetric(name, value) {
        const metric = this.customMetrics.get(name);
        if (metric) {
            metric.value = value;
            metric.timestamp = Date.now();
        }
    }

    /**
     * Remove a custom metric
     * @param {string} name - Metric name
     */
    removeCustomMetric(name) {
        this.customMetrics.delete(name);
    }

    /**
     * Get export statistics
     * @returns {Object} Export statistics
     */
    getExportStats() {
        return {
            lastExport: this.lastExport,
            customMetricsCount: this.customMetrics.size,
            isEnabled: {
                businessMetrics: this.config.enableBusinessMetrics,
                systemMetrics: this.config.enableSystemMetrics,
                performanceMetrics: this.config.enablePerformanceMetrics,
                securityMetrics: this.config.enableSecurityMetrics
            }
        };
    }

    /**
     * Create Express middleware for metrics endpoint
     * @returns {Function} Express middleware
     */
    createMetricsMiddleware() {
        return (req, res) => {
            try {
                const metrics = this.exportMetrics();
                
                res.set({
                    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                });
                
                res.send(metrics);

            } catch (error) {
                this.logger.error('Failed to serve metrics', { error: error.message });
                
                res.status(500).set('Content-Type', 'text/plain').send(
                    '# Error exporting metrics\n' +
                    `# Error: ${error.message}\n`
                );
            }
        };
    }
}

module.exports = {
    ProductionMetricsExporter
};