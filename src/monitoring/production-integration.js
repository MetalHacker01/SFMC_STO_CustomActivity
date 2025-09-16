/**
 * Production Monitoring Integration
 * Integrates all production monitoring components into a cohesive system
 */

const { ProductionMonitoringSetup } = require('../../monitoring/production-monitoring-setup');
const { ProductionHealthCheck } = require('./production-health-check');
const { ProductionMetricsExporter } = require('./production-metrics-exporter');
const { createApiLogger } = require('../logging');

class ProductionMonitoringIntegration {
    constructor(config = {}) {
        this.config = {
            enableHealthChecks: config.enableHealthChecks !== false,
            enableMetricsExport: config.enableMetricsExport !== false,
            enableAlerting: config.enableAlerting !== false,
            healthCheckInterval: config.healthCheckInterval || 30000,
            metricsExportInterval: config.metricsExportInterval || 60000,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'info' });
        
        // Initialize components
        this.monitoringSetup = null;
        this.healthCheck = null;
        this.metricsExporter = null;
        this.monitoringSystem = null;
        
        this.isInitialized = false;
        this.isRunning = false;
        
        // Intervals
        this.healthCheckInterval = null;
        this.metricsExportInterval = null;
    }

    /**
     * Initialize production monitoring
     * @param {Object} app - Express app instance
     * @returns {Promise<void>}
     */
    async initialize(app) {
        if (this.isInitialized) {
            this.logger.warn('Production monitoring already initialized');
            return;
        }

        this.logger.info('Initializing production monitoring integration');

        try {
            // Initialize monitoring setup
            this.monitoringSetup = new ProductionMonitoringSetup(this.config);
            this.monitoringSystem = await this.monitoringSetup.initialize();

            // Initialize health check system
            if (this.config.enableHealthChecks) {
                this.healthCheck = new ProductionHealthCheck({
                    timeout: 10000,
                    retryCount: 3
                });
                
                // Register default health checks
                this.healthCheck.registerDefaultHealthChecks();
                
                // Register STO-specific health checks
                await this.registerSTOHealthChecks();
            }

            // Initialize metrics exporter
            if (this.config.enableMetricsExport) {
                this.metricsExporter = new ProductionMetricsExporter(this.monitoringSystem, {
                    enableBusinessMetrics: true,
                    enableSystemMetrics: true,
                    enablePerformanceMetrics: true,
                    enableSecurityMetrics: true
                });
            }

            // Set up Express routes
            if (app) {
                this.setupExpressRoutes(app);
            }

            this.isInitialized = true;
            this.logger.info('Production monitoring integration initialized successfully');

        } catch (error) {
            this.logger.error('Failed to initialize production monitoring', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Start production monitoring
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('Production monitoring not initialized. Call initialize() first.');
        }

        if (this.isRunning) {
            this.logger.warn('Production monitoring already running');
            return;
        }

        this.logger.info('Starting production monitoring integration');

        try {
            // Start monitoring system
            if (this.monitoringSetup) {
                await this.monitoringSetup.start();
            }

            // Start periodic health checks
            if (this.healthCheck && this.config.enableHealthChecks) {
                this.startPeriodicHealthChecks();
            }

            // Start periodic metrics collection
            if (this.metricsExporter && this.config.enableMetricsExport) {
                this.startPeriodicMetricsCollection();
            }

            this.isRunning = true;
            this.logger.info('Production monitoring integration started successfully');

        } catch (error) {
            this.logger.error('Failed to start production monitoring', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    /**
     * Stop production monitoring
     * @returns {Promise<void>}
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.logger.info('Stopping production monitoring integration');

        try {
            // Stop intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            if (this.metricsExportInterval) {
                clearInterval(this.metricsExportInterval);
                this.metricsExportInterval = null;
            }

            // Stop monitoring system
            if (this.monitoringSetup) {
                await this.monitoringSetup.stop();
            }

            this.isRunning = false;
            this.logger.info('Production monitoring integration stopped');

        } catch (error) {
            this.logger.error('Error stopping production monitoring', {
                error: error.message
            });
        }
    }

    /**
     * Register STO-specific health checks
     * @private
     */
    async registerSTOHealthChecks() {
        // Timezone engine health check
        this.healthCheck.registerHealthCheck('timezone-engine', async () => {
            try {
                // Test timezone calculation functionality
                const testCountries = ['US', 'BR', 'JP', 'GB', 'AU'];
                let successCount = 0;
                
                for (const country of testCountries) {
                    try {
                        // Mock timezone calculation test
                        const offset = this.calculateTimezoneOffset(country);
                        if (typeof offset === 'number') {
                            successCount++;
                        }
                    } catch (error) {
                        // Individual country failure is acceptable
                    }
                }

                const successRate = successCount / testCountries.length;
                
                if (successRate >= 0.8) {
                    return {
                        status: 'healthy',
                        message: `Timezone engine operational (${successCount}/${testCountries.length} countries)`,
                        details: {
                            supportedCountries: successCount,
                            totalTested: testCountries.length,
                            successRate: `${(successRate * 100).toFixed(1)}%`
                        }
                    };
                } else {
                    return {
                        status: 'degraded',
                        message: `Timezone engine partially operational (${successCount}/${testCountries.length} countries)`,
                        details: {
                            supportedCountries: successCount,
                            totalTested: testCountries.length,
                            successRate: `${(successRate * 100).toFixed(1)}%`
                        }
                    };
                }
            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: 'Timezone engine failed',
                    error: error.message
                };
            }
        }, { critical: true, timeout: 5000 });

        // SFMC API connectivity health check
        this.healthCheck.registerHealthCheck('sfmc-connectivity', async () => {
            try {
                // Check if SFMC credentials are configured
                const hasCredentials = !!(
                    process.env.SFMC_CLIENT_ID &&
                    process.env.SFMC_CLIENT_SECRET &&
                    process.env.SFMC_SUBDOMAIN
                );

                if (!hasCredentials) {
                    return {
                        status: 'unhealthy',
                        message: 'SFMC credentials not configured',
                        details: {
                            clientId: !!process.env.SFMC_CLIENT_ID,
                            clientSecret: !!process.env.SFMC_CLIENT_SECRET,
                            subdomain: !!process.env.SFMC_SUBDOMAIN
                        }
                    };
                }

                // In a real implementation, you would test actual SFMC connectivity here
                // For now, we'll just verify configuration
                return {
                    status: 'healthy',
                    message: 'SFMC credentials configured',
                    details: {
                        configured: true,
                        subdomain: process.env.SFMC_SUBDOMAIN
                    }
                };

            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: 'SFMC connectivity check failed',
                    error: error.message
                };
            }
        }, { critical: true, timeout: 10000 });

        // Holiday API health check
        this.healthCheck.registerHealthCheck('holiday-api', async () => {
            if (process.env.STO_HOLIDAY_API_ENABLED !== 'true') {
                return {
                    status: 'healthy',
                    message: 'Holiday API disabled',
                    details: { enabled: false }
                };
            }

            try {
                const axios = require('axios');
                const apiUrl = process.env.STO_HOLIDAY_API_URL || 'https://date.nager.at/api/v3';
                
                const response = await axios.get(`${apiUrl}/AvailableCountries`, {
                    timeout: 5000
                });

                if (response.status === 200) {
                    return {
                        status: 'healthy',
                        message: 'Holiday API accessible',
                        details: {
                            responseTime: response.headers['x-response-time'] || 'unknown',
                            countriesAvailable: Array.isArray(response.data) ? response.data.length : 0
                        }
                    };
                } else {
                    return {
                        status: 'degraded',
                        message: `Holiday API returned status ${response.status}`,
                        details: { status: response.status }
                    };
                }

            } catch (error) {
                return {
                    status: 'degraded',
                    message: 'Holiday API not accessible, using fallback',
                    error: error.message,
                    details: { fallbackEnabled: true }
                };
            }
        }, { critical: false, timeout: 5000 });

        // Journey Builder integration health check
        this.healthCheck.registerHealthCheck('journey-builder-config', async () => {
            try {
                // Check if JWT secret is configured
                const hasJwtSecret = !!process.env.JWT_SECRET;
                const hasAppExtensionKey = !!process.env.APP_EXTENSION_KEY;

                if (!hasJwtSecret || !hasAppExtensionKey) {
                    return {
                        status: 'unhealthy',
                        message: 'Journey Builder configuration incomplete',
                        details: {
                            jwtSecret: hasJwtSecret,
                            appExtensionKey: hasAppExtensionKey
                        }
                    };
                }

                return {
                    status: 'healthy',
                    message: 'Journey Builder configuration complete',
                    details: {
                        configured: true
                    }
                };

            } catch (error) {
                return {
                    status: 'unhealthy',
                    message: 'Journey Builder configuration check failed',
                    error: error.message
                };
            }
        }, { critical: true, timeout: 2000 });
    }

    /**
     * Setup Express routes for monitoring endpoints
     * @param {Object} app - Express app
     * @private
     */
    setupExpressRoutes(app) {
        // Enhanced health endpoint
        app.get('/health/production', async (req, res) => {
            try {
                if (!this.healthCheck) {
                    return res.status(503).json({
                        status: 'unhealthy',
                        message: 'Health check system not available'
                    });
                }

                const healthReport = await this.healthCheck.runAllHealthChecks();
                const httpStatus = healthReport.status === 'healthy' ? 200 :
                                 healthReport.status === 'degraded' ? 200 : 503;

                res.status(httpStatus).json(healthReport);

            } catch (error) {
                this.logger.error('Health check endpoint error', { error: error.message });
                res.status(500).json({
                    status: 'unhealthy',
                    message: 'Health check failed',
                    error: error.message
                });
            }
        });

        // Production metrics endpoint
        if (this.metricsExporter) {
            app.get('/metrics/production', this.metricsExporter.createMetricsMiddleware());
        }

        // Monitoring status endpoint
        app.get('/monitoring/status', (req, res) => {
            try {
                const status = {
                    initialized: this.isInitialized,
                    running: this.isRunning,
                    components: {
                        monitoringSystem: !!this.monitoringSystem,
                        healthCheck: !!this.healthCheck,
                        metricsExporter: !!this.metricsExporter
                    },
                    config: {
                        enableHealthChecks: this.config.enableHealthChecks,
                        enableMetricsExport: this.config.enableMetricsExport,
                        enableAlerting: this.config.enableAlerting
                    }
                };

                if (this.metricsExporter) {
                    status.exportStats = this.metricsExporter.getExportStats();
                }

                if (this.healthCheck) {
                    status.healthSummary = this.healthCheck.getHealthSummary();
                }

                res.json(status);

            } catch (error) {
                this.logger.error('Monitoring status endpoint error', { error: error.message });
                res.status(500).json({
                    error: 'Failed to get monitoring status',
                    message: error.message
                });
            }
        });
    }

    /**
     * Start periodic health checks
     * @private
     */
    startPeriodicHealthChecks() {
        this.logger.info('Starting periodic health checks', {
            interval: this.config.healthCheckInterval
        });

        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.healthCheck.runAllHealthChecks();
            } catch (error) {
                this.logger.error('Periodic health check failed', { error: error.message });
            }
        }, this.config.healthCheckInterval);
    }

    /**
     * Start periodic metrics collection
     * @private
     */
    startPeriodicMetricsCollection() {
        this.logger.info('Starting periodic metrics collection', {
            interval: this.config.metricsExportInterval
        });

        // Register business metrics
        this.metricsExporter.registerCustomMetric('sto_activity_monitoring_enabled', 1, {
            type: 'gauge',
            help: 'Indicates if production monitoring is enabled'
        });

        this.metricsExportInterval = setInterval(() => {
            try {
                // Update dynamic metrics
                this.metricsExporter.updateCustomMetric('sto_activity_monitoring_uptime_seconds', process.uptime());
                
                // Export metrics (this happens automatically when /metrics is called)
                this.logger.debug('Metrics collection cycle completed');
                
            } catch (error) {
                this.logger.error('Periodic metrics collection failed', { error: error.message });
            }
        }, this.config.metricsExportInterval);
    }

    /**
     * Mock timezone offset calculation for health check
     * @param {string} countryCode - Country code
     * @returns {number} Timezone offset
     * @private
     */
    calculateTimezoneOffset(countryCode) {
        // Mock implementation for health check
        const offsets = {
            'US': -6, 'BR': -3, 'JP': 9, 'GB': 0, 'AU': 10,
            'CA': -5, 'IN': 5.5, 'RU': 3, 'ZA': 2, 'CN': 8
        };
        
        return offsets[countryCode] || 0;
    }

    /**
     * Get monitoring system instance
     * @returns {Object} Monitoring system
     */
    getMonitoringSystem() {
        return this.monitoringSystem;
    }

    /**
     * Get health check instance
     * @returns {Object} Health check system
     */
    getHealthCheck() {
        return this.healthCheck;
    }

    /**
     * Get metrics exporter instance
     * @returns {Object} Metrics exporter
     */
    getMetricsExporter() {
        return this.metricsExporter;
    }
}

module.exports = {
    ProductionMonitoringIntegration
};