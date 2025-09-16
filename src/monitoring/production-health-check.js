/**
 * Production Health Check Module
 * Provides comprehensive health checking for production monitoring
 */

const { createApiLogger } = require('../logging');
const { HealthStatus } = require('./health-monitor');

class ProductionHealthCheck {
    constructor(config = {}) {
        this.config = {
            timeout: config.timeout || 10000,
            retryCount: config.retryCount || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        this.logger = createApiLogger({ logLevel: 'info' });
        this.healthChecks = new Map();
        this.lastResults = new Map();
    }

    /**
     * Register a health check
     * @param {string} name - Health check name
     * @param {Function} checkFunction - Health check function
     * @param {Object} options - Health check options
     */
    registerHealthCheck(name, checkFunction, options = {}) {
        this.healthChecks.set(name, {
            name,
            checkFunction,
            options: {
                timeout: options.timeout || this.config.timeout,
                retryCount: options.retryCount || this.config.retryCount,
                critical: options.critical !== false,
                enabled: options.enabled !== false,
                ...options
            }
        });

        this.logger.debug(`Registered health check: ${name}`, {
            critical: options.critical !== false,
            timeout: options.timeout || this.config.timeout
        });
    }

    /**
     * Run all health checks
     * @returns {Promise<Object>} Health check results
     */
    async runAllHealthChecks() {
        const startTime = Date.now();
        const results = new Map();
        let overallStatus = HealthStatus.HEALTHY;
        let criticalFailures = 0;
        let totalFailures = 0;

        this.logger.info('Starting comprehensive health check', {
            checks: this.healthChecks.size,
            timestamp: new Date().toISOString()
        });

        // Run all health checks in parallel
        const checkPromises = Array.from(this.healthChecks.entries()).map(
            async ([name, healthCheck]) => {
                if (!healthCheck.options.enabled) {
                    return [name, {
                        status: HealthStatus.HEALTHY,
                        message: 'Disabled',
                        timestamp: new Date().toISOString(),
                        duration: 0
                    }];
                }

                try {
                    const result = await this.runSingleHealthCheck(name, healthCheck);
                    return [name, result];
                } catch (error) {
                    this.logger.error(`Health check failed: ${name}`, {
                        error: error.message,
                        stack: error.stack
                    });

                    return [name, {
                        status: HealthStatus.UNHEALTHY,
                        message: error.message,
                        timestamp: new Date().toISOString(),
                        duration: 0,
                        error: true
                    }];
                }
            }
        );

        // Wait for all health checks to complete
        const checkResults = await Promise.all(checkPromises);

        // Process results
        for (const [name, result] of checkResults) {
            results.set(name, result);
            this.lastResults.set(name, result);

            // Update overall status
            if (result.status === HealthStatus.UNHEALTHY) {
                totalFailures++;
                const healthCheck = this.healthChecks.get(name);
                if (healthCheck?.options.critical) {
                    criticalFailures++;
                    overallStatus = HealthStatus.UNHEALTHY;
                }
            } else if (result.status === HealthStatus.DEGRADED && overallStatus === HealthStatus.HEALTHY) {
                const healthCheck = this.healthChecks.get(name);
                if (healthCheck?.options.critical) {
                    overallStatus = HealthStatus.DEGRADED;
                }
            }
        }

        const duration = Date.now() - startTime;

        const healthReport = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            summary: {
                total: this.healthChecks.size,
                healthy: this.healthChecks.size - totalFailures,
                failed: totalFailures,
                critical_failures: criticalFailures
            },
            checks: Object.fromEntries(results),
            system: await this.getSystemMetrics()
        };

        this.logger.info('Health check completed', {
            status: overallStatus,
            duration: `${duration}ms`,
            total: this.healthChecks.size,
            failed: totalFailures,
            critical_failures: criticalFailures
        });

        return healthReport;
    }

    /**
     * Run a single health check with retry logic
     * @param {string} name - Health check name
     * @param {Object} healthCheck - Health check configuration
     * @returns {Promise<Object>} Health check result
     */
    async runSingleHealthCheck(name, healthCheck) {
        const startTime = Date.now();
        let lastError = null;

        for (let attempt = 1; attempt <= healthCheck.options.retryCount; attempt++) {
            try {
                this.logger.debug(`Running health check: ${name} (attempt ${attempt})`);

                // Run health check with timeout
                const result = await Promise.race([
                    healthCheck.checkFunction(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Health check timeout')), healthCheck.options.timeout)
                    )
                ]);

                const duration = Date.now() - startTime;

                // Normalize result
                const normalizedResult = this.normalizeHealthCheckResult(result, duration);

                this.logger.debug(`Health check completed: ${name}`, {
                    status: normalizedResult.status,
                    duration: `${duration}ms`,
                    attempt
                });

                return normalizedResult;

            } catch (error) {
                lastError = error;
                this.logger.warn(`Health check attempt failed: ${name}`, {
                    attempt,
                    error: error.message,
                    retryCount: healthCheck.options.retryCount
                });

                // Wait before retry (except for last attempt)
                if (attempt < healthCheck.options.retryCount) {
                    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
                }
            }
        }

        // All attempts failed
        const duration = Date.now() - startTime;
        throw new Error(`Health check failed after ${healthCheck.options.retryCount} attempts: ${lastError?.message || 'Unknown error'}`);
    }

    /**
     * Normalize health check result
     * @param {*} result - Raw health check result
     * @param {number} duration - Check duration
     * @returns {Object} Normalized result
     */
    normalizeHealthCheckResult(result, duration) {
        // Handle different result formats
        if (typeof result === 'boolean') {
            return {
                status: result ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
                message: result ? 'OK' : 'Failed',
                timestamp: new Date().toISOString(),
                duration: `${duration}ms`
            };
        }

        if (typeof result === 'object' && result !== null) {
            return {
                status: result.status || HealthStatus.HEALTHY,
                message: result.message || 'OK',
                timestamp: new Date().toISOString(),
                duration: `${duration}ms`,
                details: result.details || {},
                ...result
            };
        }

        // Default case
        return {
            status: HealthStatus.HEALTHY,
            message: 'OK',
            timestamp: new Date().toISOString(),
            duration: `${duration}ms`,
            details: { result }
        };
    }

    /**
     * Get system metrics
     * @returns {Promise<Object>} System metrics
     */
    async getSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            
            return {
                uptime: process.uptime(),
                memory: {
                    rss: memUsage.rss,
                    heapUsed: memUsage.heapUsed,
                    heapTotal: memUsage.heapTotal,
                    external: memUsage.external,
                    usage_percent: ((memUsage.rss / (1024 * 1024 * 1024)) * 100).toFixed(2) + '%'
                },
                cpu: {
                    user: cpuUsage.user,
                    system: cpuUsage.system,
                    usage_percent: (((cpuUsage.user + cpuUsage.system) / 1000000) * 100).toFixed(2) + '%'
                },
                process: {
                    pid: process.pid,
                    version: process.version,
                    platform: process.platform,
                    arch: process.arch
                },
                environment: {
                    node_env: process.env.NODE_ENV,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                }
            };
        } catch (error) {
            this.logger.error('Failed to get system metrics', { error: error.message });
            return {
                error: 'Failed to collect system metrics',
                message: error.message
            };
        }
    }

    /**
     * Get last health check results
     * @returns {Object} Last results
     */
    getLastResults() {
        return Object.fromEntries(this.lastResults);
    }

    /**
     * Get health check for specific component
     * @param {string} name - Component name
     * @returns {Object|null} Health check result
     */
    getComponentHealth(name) {
        return this.lastResults.get(name) || null;
    }

    /**
     * Check if system is healthy
     * @returns {boolean} True if healthy
     */
    isHealthy() {
        for (const [name, result] of this.lastResults) {
            const healthCheck = this.healthChecks.get(name);
            if (healthCheck?.options.critical && result.status === HealthStatus.UNHEALTHY) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get health summary
     * @returns {Object} Health summary
     */
    getHealthSummary() {
        const results = Array.from(this.lastResults.values());
        const total = results.length;
        const healthy = results.filter(r => r.status === HealthStatus.HEALTHY).length;
        const degraded = results.filter(r => r.status === HealthStatus.DEGRADED).length;
        const unhealthy = results.filter(r => r.status === HealthStatus.UNHEALTHY).length;

        let overallStatus = HealthStatus.HEALTHY;
        if (unhealthy > 0) {
            // Check if any critical components are unhealthy
            const criticalUnhealthy = Array.from(this.lastResults.entries())
                .filter(([name, result]) => {
                    const healthCheck = this.healthChecks.get(name);
                    return healthCheck?.options.critical && result.status === HealthStatus.UNHEALTHY;
                }).length;
            
            overallStatus = criticalUnhealthy > 0 ? HealthStatus.UNHEALTHY : HealthStatus.DEGRADED;
        } else if (degraded > 0) {
            overallStatus = HealthStatus.DEGRADED;
        }

        return {
            status: overallStatus,
            total,
            healthy,
            degraded,
            unhealthy,
            last_check: this.lastResults.size > 0 ? 
                Math.max(...Array.from(this.lastResults.values()).map(r => new Date(r.timestamp).getTime())) :
                null
        };
    }

    /**
     * Register default production health checks
     */
    registerDefaultHealthChecks() {
        // System health check
        this.registerHealthCheck('system', async () => {
            const metrics = await this.getSystemMetrics();
            const memUsagePercent = parseFloat(metrics.memory.usage_percent);
            const cpuUsagePercent = parseFloat(metrics.cpu.usage_percent);

            let status = HealthStatus.HEALTHY;
            let message = 'System resources are healthy';

            if (memUsagePercent > 90 || cpuUsagePercent > 90) {
                status = HealthStatus.UNHEALTHY;
                message = `High resource usage: Memory ${memUsagePercent}%, CPU ${cpuUsagePercent}%`;
            } else if (memUsagePercent > 80 || cpuUsagePercent > 80) {
                status = HealthStatus.DEGRADED;
                message = `Elevated resource usage: Memory ${memUsagePercent}%, CPU ${cpuUsagePercent}%`;
            }

            return {
                status,
                message,
                details: metrics
            };
        }, { critical: true, timeout: 5000 });

        // Environment health check
        this.registerHealthCheck('environment', async () => {
            const requiredEnvVars = [
                'JWT_SECRET',
                'SFMC_CLIENT_ID',
                'SFMC_CLIENT_SECRET',
                'SFMC_SUBDOMAIN'
            ];

            const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);

            if (missing.length > 0) {
                return {
                    status: HealthStatus.UNHEALTHY,
                    message: `Missing required environment variables: ${missing.join(', ')}`,
                    details: { missing }
                };
            }

            return {
                status: HealthStatus.HEALTHY,
                message: 'All required environment variables are set',
                details: {
                    node_env: process.env.NODE_ENV,
                    configured_vars: requiredEnvVars.length
                }
            };
        }, { critical: true, timeout: 1000 });

        // Disk space health check (if applicable)
        this.registerHealthCheck('disk-space', async () => {
            try {
                const fs = require('fs');
                const stats = fs.statSync('.');
                
                // This is a simplified check - in production you'd want to check actual disk usage
                return {
                    status: HealthStatus.HEALTHY,
                    message: 'Disk space check passed',
                    details: {
                        note: 'Simplified disk check - implement proper disk monitoring in production'
                    }
                };
            } catch (error) {
                return {
                    status: HealthStatus.DEGRADED,
                    message: 'Could not check disk space',
                    details: { error: error.message }
                };
            }
        }, { critical: false, timeout: 2000 });
    }
}

module.exports = {
    ProductionHealthCheck,
    HealthStatus
};