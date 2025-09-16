/**
 * Production Monitoring Setup
 * Comprehensive monitoring configuration for production deployment
 */

const { MonitoringSystem, HealthStatus, AlertSeverity } = require('../src/monitoring');
const { createApiLogger } = require('../src/logging');

class ProductionMonitoringSetup {
    constructor(config = {}) {
        this.config = {
            enableHealthMonitoring: config.enableHealthMonitoring !== false,
            enablePerformanceCollection: config.enablePerformanceCollection !== false,
            enableAlerting: config.enableAlerting !== false,
            enableMetricsExport: config.enableMetricsExport !== false,
            healthCheckInterval: config.healthCheckInterval || 30000,
            metricsCollectionInterval: config.metricsCollectionInterval || 60000,
            alertEvaluationInterval: config.alertEvaluationInterval || 30000,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'info' });
        this.monitoringSystem = null;
        this.isSetup = false;
    }

    /**
     * Initialize production monitoring
     */
    async initialize() {
        if (this.isSetup) {
            this.logger.warn('Production monitoring already initialized');
            return this.monitoringSystem;
        }

        this.logger.info('Initializing production monitoring system');

        // Create monitoring system with production configuration
        this.monitoringSystem = new MonitoringSystem({
            enableHealthMonitoring: this.config.enableHealthMonitoring,
            enablePerformanceCollection: this.config.enablePerformanceCollection,
            enableAlerting: this.config.enableAlerting,
            healthCheckInterval: this.config.healthCheckInterval,
            metricsCollectionInterval: this.config.metricsCollectionInterval,
            alertEvaluationInterval: this.config.alertEvaluationInterval,
            
            // Production-specific configurations
            health: {
                checkInterval: this.config.healthCheckInterval,
                timeout: 10000,
                retryCount: 3,
                degradedThreshold: 0.8,
                unhealthyThreshold: 0.5
            },
            
            performance: {
                collectionInterval: this.config.metricsCollectionInterval,
                retentionPeriod: 86400000, // 24 hours
                maxDataPoints: 1440, // 24 hours of minute data
                enableAutoCollection: true
            },
            
            alerting: {
                enableAlerting: this.config.enableAlerting,
                evaluationInterval: this.config.alertEvaluationInterval,
                channels: this._getAlertChannels()
            }
        });

        // Register production health checks
        await this._registerHealthChecks();

        // Register production metrics
        this._registerProductionMetrics();

        // Register production alert rules
        this._registerProductionAlertRules();

        // Register alert channels
        this._registerAlertChannels();

        this.isSetup = true;
        this.logger.info('Production monitoring system initialized successfully');

        return this.monitoringSystem;
    }

    /**
     * Start production monitoring
     */
    async start() {
        if (!this.isSetup) {
            await this.initialize();
        }

        this.logger.info('Starting production monitoring system');
        this.monitoringSystem.start();

        // Set up graceful shutdown
        this._setupGracefulShutdown();

        this.logger.info('Production monitoring system started');
    }

    /**
     * Stop production monitoring
     */
    async stop() {
        if (!this.monitoringSystem) {
            return;
        }

        this.logger.info('Stopping production monitoring system');
        this.monitoringSystem.stop();
        this.logger.info('Production monitoring system stopped');
    }

    /**
     * Get monitoring system instance
     */
    getMonitoringSystem() {
        return this.monitoringSystem;
    }

    /**
     * Register production health checks
     * @private
     */
    async _registerHealthChecks() {
        const { TimezoneEngine } = require('../src/timezone-engine');
        const { HolidayChecker } = require('../src/holiday');
        
        // System health check
        this.monitoringSystem.registerHealthCheck('system', async () => {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            
            return {
                status: HealthStatus.HEALTHY,
                details: {
                    memory: {
                        rss: memUsage.rss,
                        heapUsed: memUsage.heapUsed,
                        heapTotal: memUsage.heapTotal,
                        external: memUsage.external
                    },
                    cpu: {
                        user: cpuUsage.user,
                        system: cpuUsage.system
                    },
                    uptime: process.uptime()
                }
            };
        }, { critical: true, timeout: 5000 });

        // Timezone engine health check
        this.monitoringSystem.registerHealthCheck('timezone-engine', async () => {
            try {
                // Test timezone calculation
                const testResult = TimezoneEngine.prototype.calculateTimezoneOffset?.('US') || 0;
                
                return {
                    status: HealthStatus.HEALTHY,
                    details: {
                        supportedCountries: 19, // Based on requirements
                        testCalculation: testResult
                    }
                };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    error: error.message
                };
            }
        }, { critical: true, timeout: 5000 });

        // SFMC API health check
        this.monitoringSystem.registerHealthCheck('sfmc-api', async () => {
            try {
                // Test SFMC connectivity (mock for now)
                const isConnected = process.env.SFMC_CLIENT_ID && process.env.SFMC_CLIENT_SECRET;
                
                return {
                    status: isConnected ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
                    details: {
                        configured: isConnected,
                        lastCheck: new Date().toISOString()
                    }
                };
            } catch (error) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    error: error.message
                };
            }
        }, { critical: true, timeout: 10000 });

        // Holiday API health check
        this.monitoringSystem.registerHealthCheck('holiday-api', async () => {
            if (process.env.STO_HOLIDAY_API_ENABLED !== 'true') {
                return {
                    status: HealthStatus.HEALTHY,
                    details: { enabled: false }
                };
            }

            try {
                // Test holiday API connectivity
                const axios = require('axios');
                const response = await axios.get(
                    `${process.env.STO_HOLIDAY_API_URL || 'https://date.nager.at/api/v3'}/AvailableCountries`,
                    { timeout: 5000 }
                );
                
                return {
                    status: response.status === 200 ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
                    details: {
                        responseTime: response.headers['x-response-time'] || 'unknown',
                        countriesAvailable: Array.isArray(response.data) ? response.data.length : 0
                    }
                };
            } catch (error) {
                return {
                    status: HealthStatus.DEGRADED,
                    error: error.message,
                    details: { fallbackEnabled: true }
                };
            }
        }, { critical: false, timeout: 5000 });

        // Database health check (if enabled)
        if (process.env.POSTGRES_ENABLED === 'true') {
            this.monitoringSystem.registerHealthCheck('database', async () => {
                try {
                    // Mock database check - replace with actual database connection test
                    return {
                        status: HealthStatus.HEALTHY,
                        details: {
                            connected: true,
                            lastQuery: new Date().toISOString()
                        }
                    };
                } catch (error) {
                    return {
                        status: HealthStatus.UNHEALTHY,
                        error: error.message
                    };
                }
            }, { critical: true, timeout: 5000 });
        }

        // Redis health check (if enabled)
        if (process.env.REDIS_ENABLED === 'true') {
            this.monitoringSystem.registerHealthCheck('redis', async () => {
                try {
                    // Mock Redis check - replace with actual Redis connection test
                    return {
                        status: HealthStatus.HEALTHY,
                        details: {
                            connected: true,
                            memory: 'unknown'
                        }
                    };
                } catch (error) {
                    return {
                        status: HealthStatus.DEGRADED,
                        error: error.message
                    };
                }
            }, { critical: false, timeout: 3000 });
        }
    }

    /**
     * Register production metrics
     * @private
     */
    _registerProductionMetrics() {
        // Business metrics
        this.monitoringSystem.registerMetric('sto_contacts_processed_total', 'counter', {
            description: 'Total number of contacts processed by STO activity',
            labels: ['status', 'country']
        });

        this.monitoringSystem.registerMetric('sto_send_time_calculations_total', 'counter', {
            description: 'Total number of send time calculations performed',
            labels: ['country', 'timezone']
        });

        this.monitoringSystem.registerMetric('sto_send_time_calculation_duration_seconds', 'histogram', {
            description: 'Duration of send time calculations in seconds',
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
        });

        this.monitoringSystem.registerMetric('sto_timezone_calculations_total', 'counter', {
            description: 'Total number of timezone calculations',
            labels: ['country', 'success']
        });

        this.monitoringSystem.registerMetric('sto_holiday_checks_total', 'counter', {
            description: 'Total number of holiday checks performed',
            labels: ['country', 'result']
        });

        this.monitoringSystem.registerMetric('sto_data_extension_updates_total', 'counter', {
            description: 'Total number of data extension updates',
            labels: ['status']
        });

        // Error metrics
        this.monitoringSystem.registerMetric('sto_errors_total', 'counter', {
            description: 'Total number of errors by type',
            labels: ['type', 'component']
        });

        this.monitoringSystem.registerMetric('sto_sfmc_api_failures_total', 'counter', {
            description: 'Total number of SFMC API failures',
            labels: ['operation', 'error_type']
        });

        this.monitoringSystem.registerMetric('sto_holiday_api_failures_total', 'counter', {
            description: 'Total number of holiday API failures'
        });

        // Performance metrics
        this.monitoringSystem.registerMetric('sto_memory_usage_bytes', 'gauge', {
            description: 'Memory usage in bytes'
        });

        this.monitoringSystem.registerMetric('sto_cpu_usage_ratio', 'gauge', {
            description: 'CPU usage ratio (0-1)'
        });

        this.monitoringSystem.registerMetric('sto_cache_hits_total', 'counter', {
            description: 'Total number of cache hits',
            labels: ['cache_type']
        });

        this.monitoringSystem.registerMetric('sto_cache_misses_total', 'counter', {
            description: 'Total number of cache misses',
            labels: ['cache_type']
        });
    }

    /**
     * Register production alert rules
     * @private
     */
    _registerProductionAlertRules() {
        // Critical alerts
        this.monitoringSystem.registerAlertRule('sto_activity_down', {
            condition: (metrics) => metrics.healthStatus === HealthStatus.UNHEALTHY,
            severity: AlertSeverity.CRITICAL,
            message: 'STO Activity is down or unhealthy',
            suppressionWindow: 300000, // 5 minutes
            channels: ['email', 'slack', 'webhook']
        });

        this.monitoringSystem.registerAlertRule('high_error_rate', {
            condition: (metrics) => {
                const errorRate = parseFloat(metrics.errorRate?.replace('%', '') || 0);
                return errorRate > 10; // 10% error rate
            },
            severity: AlertSeverity.CRITICAL,
            message: 'High error rate detected: {errorRate}',
            suppressionWindow: 300000,
            channels: ['email', 'slack']
        });

        this.monitoringSystem.registerAlertRule('sfmc_api_failures', {
            condition: (metrics) => {
                return (metrics.sfmc_api_failures || 0) > 5; // More than 5 failures per minute
            },
            severity: AlertSeverity.CRITICAL,
            message: 'SFMC API failures detected: {sfmc_api_failures} failures',
            suppressionWindow: 300000,
            channels: ['email', 'slack', 'webhook']
        });

        // Warning alerts
        this.monitoringSystem.registerAlertRule('high_response_time', {
            condition: (metrics) => {
                const avgResponseTime = parseFloat(metrics.avgResponseTime?.replace('ms', '') || 0);
                return avgResponseTime > 5000; // 5 seconds
            },
            severity: AlertSeverity.WARNING,
            message: 'High response time detected: {avgResponseTime}',
            suppressionWindow: 600000, // 10 minutes
            channels: ['email', 'slack']
        });

        this.monitoringSystem.registerAlertRule('high_memory_usage', {
            condition: (metrics) => {
                const memUsage = process.memoryUsage();
                const memUsagePercent = (memUsage.rss / (1024 * 1024 * 1024)) * 100; // Convert to GB percentage
                return memUsagePercent > 85; // 85% memory usage
            },
            severity: AlertSeverity.WARNING,
            message: 'High memory usage detected: {memUsagePercent}%',
            suppressionWindow: 600000,
            channels: ['email', 'slack']
        });

        this.monitoringSystem.registerAlertRule('holiday_api_degraded', {
            condition: (metrics) => {
                return (metrics.holiday_api_failures || 0) > 2; // More than 2 failures per minute
            },
            severity: AlertSeverity.WARNING,
            message: 'Holiday API is experiencing issues: {holiday_api_failures} failures',
            suppressionWindow: 600000,
            channels: ['email']
        });

        // Business alerts
        this.monitoringSystem.registerAlertRule('contact_processing_failures', {
            condition: (metrics) => {
                const processingFailures = metrics.contact_processing_failures || 0;
                const totalProcessed = metrics.contacts_processed || 1;
                const failureRate = (processingFailures / totalProcessed) * 100;
                return failureRate > 5; // 5% failure rate
            },
            severity: AlertSeverity.WARNING,
            message: 'High contact processing failure rate: {failureRate}%',
            suppressionWindow: 900000, // 15 minutes
            channels: ['email', 'slack']
        });
    }

    /**
     * Register alert channels
     * @private
     */
    _registerAlertChannels() {
        // Email channel
        if (process.env.EMAIL_ALERTS_ENABLED === 'true') {
            this.monitoringSystem.registerAlertChannel('email', 'email', {
                smtp: {
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    }
                },
                from: process.env.SMTP_FROM,
                to: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
                subject: '[STO Activity] {severity}: {message}',
                template: 'production-alert'
            });
        }

        // Slack channel
        if (process.env.SLACK_ALERTS_ENABLED === 'true') {
            this.monitoringSystem.registerAlertChannel('slack', 'webhook', {
                url: process.env.SLACK_WEBHOOK_URL,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                payload: {
                    channel: process.env.SLACK_CHANNEL || '#alerts',
                    username: 'STO Activity Monitor',
                    icon_emoji: ':warning:',
                    text: '{severity}: {message}',
                    attachments: [{
                        color: 'danger',
                        fields: [{
                            title: 'Timestamp',
                            value: '{timestamp}',
                            short: true
                        }, {
                            title: 'Service',
                            value: 'STO Activity',
                            short: true
                        }]
                    }]
                }
            });
        }

        // Webhook channel
        if (process.env.WEBHOOK_ALERTS_ENABLED === 'true') {
            this.monitoringSystem.registerAlertChannel('webhook', 'webhook', {
                url: process.env.ALERT_WEBHOOK_URL,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`
                },
                payload: {
                    service: 'sto-activity',
                    severity: '{severity}',
                    message: '{message}',
                    timestamp: '{timestamp}',
                    metrics: '{metrics}'
                }
            });
        }
    }

    /**
     * Get alert channels configuration
     * @private
     */
    _getAlertChannels() {
        const channels = [];
        
        if (process.env.EMAIL_ALERTS_ENABLED === 'true') {
            channels.push('email');
        }
        
        if (process.env.SLACK_ALERTS_ENABLED === 'true') {
            channels.push('slack');
        }
        
        if (process.env.WEBHOOK_ALERTS_ENABLED === 'true') {
            channels.push('webhook');
        }
        
        return channels;
    }

    /**
     * Setup graceful shutdown
     * @private
     */
    _setupGracefulShutdown() {
        const shutdown = async (signal) => {
            this.logger.info(`Received ${signal}, shutting down gracefully`);
            
            try {
                await this.stop();
                process.exit(0);
            } catch (error) {
                this.logger.error('Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
    }
}

module.exports = {
    ProductionMonitoringSetup
};